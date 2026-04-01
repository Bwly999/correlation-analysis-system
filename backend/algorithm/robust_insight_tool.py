import os
import sys
import logging
import platform
import warnings
import re
import math
import io
import base64
from typing import Optional, List, Tuple, Union, Dict, Any
from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import seaborn as sns

# 尝试导入核心计算库，如果缺失则优雅报错
try:
    import xgboost as xgb
    import shap
    from sklearn.model_selection import train_test_split, RandomizedSearchCV
    from sklearn.preprocessing import LabelEncoder
    from sklearn.metrics import r2_score, mean_absolute_error
    from sklearn.ensemble import IsolationForest
except ImportError as e:
    sys.exit(f"[Critical Error] 缺少必要依赖库: {e.name}。请运行: pip install xgboost shap scikit-learn pandas matplotlib seaborn")

# ==========================================
# 0. 全局配置与日志系统 (Configuration & Logging)
# ==========================================
@dataclass
class AppConfig:
    """应用程序配置数据类，集中管理参数"""
    RANDOM_SEED: int = 42
    TEST_SIZE: float = 0.2
    
    # [模型参数]
    MODEL_ESTIMATORS: int = 500
    MODEL_LEARNING_RATE: float = 0.05
    MODEL_MAX_DEPTH: int = 6
    AUTO_TUNE_THRESHOLD: float = 0.6  # 如果 R2 低于此值，触发自动调参
    
    # [SHAP参数]
    SHAP_SAMPLE_LIMIT: int = 2000  # 增加采样上限以获得更精确的分析
    
    # [清洗参数]
    OUTLIER_CONTAMINATION: float = 0.05 # 孤立森林认为异常数据的比例 (默认 5%)
    IQR_THRESHOLD: float = 1.5 # IQR 倍数
    
    # [绘图参数]
    BASE_FIGURE_WIDTH: int = 24
    DPI: int = 150
    FONT_SCALE: float = 0.8
    # 默认输出目录 (可覆盖)
    DEFAULT_OUTPUT_DIR: str = "analysis_output"

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("RobustInsight")

# 抑制非关键警告
warnings.filterwarnings('ignore')

# ==========================================
# 1. 系统环境层：兼容性与字体管理 (System Context)
# ==========================================
class SystemContext:
    """
    负责处理操作系统差异、字体加载和中文乱码修复。
    """
    @staticmethod
    def configure_environment(output_dir: str):
        """执行环境初始化配置"""
        logger.info(f"正在检测系统环境: {platform.system()} {platform.release()}")
        SystemContext._fix_matplotlib_chinese()
        SystemContext._create_output_dir(output_dir)

    @staticmethod
    def _create_output_dir(output_dir: str):
        if not os.path.exists(output_dir):
            try:
                os.makedirs(output_dir)
                logger.info(f"创建输出目录: {output_dir}")
            except Exception as e:
                logger.error(f"无法创建目录: {e}")

    @staticmethod
    def _fix_matplotlib_chinese():
        system_name = platform.system()
        font_candidates = [
            'Microsoft YaHei', 'SimHei', 'SimSun', 'KaiTi',
            'PingFang SC', 'Arial Unicode MS', 'Heiti TC', 'Hiragino Sans GB',
            'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', 'DejaVu Sans', 'Noto Sans CJK JP'
        ]
        plt.rcParams['axes.unicode_minus'] = False 
        
        found_font = False
        available_fonts = set(f.name for f in fm.fontManager.ttflist)
        for font in font_candidates:
            if font in available_fonts:
                plt.rcParams['font.sans-serif'] = [font]
                logger.info(f"字体配置成功 (Matplotlib Cache): 使用 {font}")
                found_font = True
                break
        
        if not found_font:
            logger.warning("未在 Matplotlib 缓存中找到推荐字体，尝试系统默认回退机制...")
            if system_name == "Windows":
                plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei']
            elif system_name == "Darwin":
                plt.rcParams['font.sans-serif'] = ['PingFang SC', 'Arial Unicode MS']
            else:
                plt.rcParams['font.sans-serif'] = ['sans-serif']

# ==========================================
# 2. 数据引擎层：加载、清洗与筛选 (Data Engine)
# ==========================================
class DataEngine:
    """
    负责数据的加载、校验、清洗（含异常值剔除）、筛选和预处理。
    """
    
    def __init__(self, target_col: str, 
                 include_cols: Optional[List[str]] = None, 
                 exclude_cols: Optional[List[str]] = None, 
                 use_regex: bool = True,
                 clean_outliers_method: Optional[str] = None):
        """
        :param clean_outliers_method: 'iqr', 'isolation_forest' or None
        """
        self.target_col = target_col
        self.encoders: Dict[str, LabelEncoder] = {}
        self.feature_names: List[str] = []
        
        # 筛选配置
        self.include_cols = include_cols
        self.exclude_cols = exclude_cols
        self.use_regex = use_regex
        self.clean_outliers_method = clean_outliers_method

    def load_data(self, source: Union[str, pd.DataFrame]) -> pd.DataFrame:
        """加载数据，支持 CSV(自动分隔符), Excel 或 DataFrame 对象"""
        df = None
        try:
            if isinstance(source, pd.DataFrame):
                df = source.copy()
                logger.info("已加载内存中的 DataFrame")
            elif isinstance(source, str):
                if not os.path.exists(source):
                    raise FileNotFoundError(f"文件不存在: {source}")
                
                ext = source.split('.')[-1].lower()
                if ext == 'csv':
                    # [优化] 使用 python 引擎自动探测分隔符 (Tab 或 Comma)
                    try:
                        df = pd.read_csv(source, sep=None, engine='python')
                        logger.info(f"成功加载 CSV 文件 (自动探测分隔符): {source}")
                    except Exception as e:
                        logger.warning(f"自动探测分隔符失败，尝试默认读取: {e}")
                        df = pd.read_csv(source)
                elif ext in ['xls', 'xlsx']:
                    df = pd.read_excel(source)
                else:
                    raise ValueError("不支持的文件格式，仅支持 csv/xlsx")
                
                logger.info(f"原始数据加载完成, Shape: {df.shape}")
            
            if df is None or df.empty:
                raise ValueError("数据为空")

            # 1. 执行列筛选
            df = self._filter_columns(df)
            
            # 2. 执行数据清洗 (含缺失值填充、异常值剔除、编码)
            return self._clean_data(df)
            
        except Exception as e:
            logger.critical(f"数据加载失败: {str(e)}")
            raise

    def _filter_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """根据规则筛选列"""
        if not self.include_cols and not self.exclude_cols:
            return df
            
        logger.info(f"正在根据规则筛选列 (正则模式: {self.use_regex})...")
        all_cols = df.columns.tolist()
        keep_cols = set(all_cols) 

        # 包含规则
        if self.include_cols:
            current_keep = set()
            if self.target_col in all_cols:
                current_keep.add(self.target_col)
            for pattern in self.include_cols:
                if self.use_regex:
                    matches = [c for c in all_cols if re.search(pattern, c)]
                    if matches: current_keep.update(matches)
                else:
                    if pattern in all_cols: current_keep.add(pattern)
            keep_cols = current_keep
            
        # 排除规则
        if self.exclude_cols:
            for pattern in self.exclude_cols:
                if self.use_regex:
                    matches = [c for c in keep_cols if re.search(pattern, c)]
                    for m in matches:
                        if m != self.target_col: keep_cols.discard(m)
                else:
                    if pattern in keep_cols and pattern != self.target_col:
                        keep_cols.discard(pattern)

        final_cols = list(keep_cols)
        if not final_cols:
            raise ValueError("列筛选结果为空！")
        
        if self.target_col in all_cols and self.target_col not in final_cols:
            final_cols.append(self.target_col)
            
        logger.info(f"列筛选完成: {len(all_cols)} -> {len(final_cols)} 列")
        return df[final_cols]

    def _clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        鲁棒的数据清洗流程:
        检查Target -> 丢弃空列 -> 填充缺失 -> 编码 -> 异常值剔除
        """
        # 1. 检查目标列
        if self.target_col not in df.columns:
            raise ValueError(f"数据中未找到目标列(Y): {self.target_col}")

        # 2. 丢弃全空列
        original_cols = len(df.columns)
        df = df.dropna(axis=1, how='all')
        if len(df.columns) < original_cols:
            logger.warning(f"已丢弃 {original_cols - len(df.columns)} 个全空列")

        # 3. 处理缺失值 (先填充，以便后续算法计算)
        for col in df.columns:
            if df[col].isnull().any():
                if pd.api.types.is_numeric_dtype(df[col]):
                    df[col] = df[col].fillna(df[col].median())
                else:
                    df[col] = df[col].fillna(df[col].mode()[0])

        # 4. 自动编码非数值特征 (Auto-Encoding)
        for col in df.columns:
            if col == self.target_col:
                continue
            if not pd.api.types.is_numeric_dtype(df[col]):
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col].astype(str))
                self.encoders[col] = le
        
        # 5. [优化] 异常值剔除 (在数据完全准备好后进行)
        if self.clean_outliers_method:
            df = self._remove_outliers(df)

        self.feature_names = [c for c in df.columns if c != self.target_col]
        return df

    def _remove_outliers(self, df: pd.DataFrame) -> pd.DataFrame:
        """执行异常值检测与剔除"""
        # 仅对数值列进行检测 (排除 Target 还是包含 Target? 通常异常检测基于 Feature，Target 如果异常也该删)
        # 这里我们基于 Feature + Target 的数值列进行综合判断
        num_cols = df.select_dtypes(include=[np.number]).columns
        
        initial_rows = len(df)
        mask = np.ones(len(df), dtype=bool)

        if self.clean_outliers_method.lower() == 'iqr':
            logger.info("正在使用 IQR 算法清洗异常值...")
            for col in num_cols:
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - AppConfig.IQR_THRESHOLD * IQR
                upper_bound = Q3 + AppConfig.IQR_THRESHOLD * IQR
                col_mask = (df[col] >= lower_bound) & (df[col] <= upper_bound)
                mask = mask & col_mask 

        elif self.clean_outliers_method.lower() == 'isolation_forest':
            logger.info("正在使用 Isolation Forest 算法清洗异常值...")
            iso = IsolationForest(contamination=AppConfig.OUTLIER_CONTAMINATION, random_state=AppConfig.RANDOM_SEED, n_jobs=-1)
            preds = iso.fit_predict(df[num_cols])
            mask = preds == 1
            
        else:
            logger.warning(f"未知的异常清洗方法: {self.clean_outliers_method}, 跳过清洗")
            return df

        df_cleaned = df[mask].copy()
        removed_rows = initial_rows - len(df_cleaned)
        logger.info(f"异常值清洗完成: 移除 {removed_rows} 行 ({removed_rows/initial_rows:.1%}), 剩余 {len(df_cleaned)} 行")
        
        if len(df_cleaned) < 10:
            logger.warning("警报：清洗后数据量过少，建议放宽清洗条件或禁用清洗功能！")

        return df_cleaned

    def get_X_y(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        return df[self.feature_names], df[self.target_col]

# ==========================================
# 3. 核心模型层：训练与智能调优 (Model Core)
# ==========================================
class ModelCore:
    """封装 XGBoost 逻辑，包含自动超参数调优。"""
    def __init__(self):
        self.model = None
        self.r2_score = 0.0
        self.mae = 0.0

    def train(self, X: pd.DataFrame, y: pd.Series, metric: str = 'r2'):
        """
        训练模型
        :param metric: 'r2' 或 'mae'。决定了自动调优的优化目标和 Champion 模型选择标准。
        """
        logger.info(f"开始切分数据集... (优化目标: {metric.upper()})")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=AppConfig.TEST_SIZE, random_state=AppConfig.RANDOM_SEED
        )

        logger.info(f">>> 阶段1: 快速训练 (LR={AppConfig.MODEL_LEARNING_RATE})...")
        # 1. 训练默认模型
        default_model = xgb.XGBRegressor(
            n_estimators=AppConfig.MODEL_ESTIMATORS,
            learning_rate=AppConfig.MODEL_LEARNING_RATE,
            max_depth=AppConfig.MODEL_MAX_DEPTH,
            n_jobs=-1,
            random_state=AppConfig.RANDOM_SEED,
            importance_type='total_gain',
            early_stopping_rounds=50
        )
        default_model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        y_pred = default_model.predict(X_test)
        initial_r2 = r2_score(y_test, y_pred)
        initial_mae = mean_absolute_error(y_test, y_pred)

        # 先假定默认模型是最好的
        self.model = default_model
        self.r2_score = initial_r2
        self.mae = initial_mae
        
        # 判断是否触发调优 (默认用 R2 阈值判断，即使优化目标是 MAE，R2 太低也说明模型差)
        needs_tuning = initial_r2 < AppConfig.AUTO_TUNE_THRESHOLD
        
        if needs_tuning:
            logger.warning(f"初次训练 R² ({initial_r2:.4f}) 低于阈值 ({AppConfig.AUTO_TUNE_THRESHOLD})")
            logger.info(">>> 阶段2: 触发智能调优 (5-Fold CV Grid Search)...")
            
            param_dist = {
                'max_depth': [3, 4, 5, 6, 7, 8, 9],
                'learning_rate': [0.01, 0.03, 0.05, 0.1, 0.2],
                'n_estimators': [200, 300, 500, 800],
                'subsample': [0.6, 0.7, 0.8, 1.0],
                'colsample_bytree': [0.6, 0.7, 0.8, 1.0],
                'reg_alpha': [0, 0.1, 1, 10],
                'reg_lambda': [1, 1.5, 2, 5],
                'min_child_weight': [1, 3, 5]
            }
            
            # 确定 CV 评分标准
            scoring_metric = 'r2' if metric == 'r2' else 'neg_mean_absolute_error'
            
            xgb_base = xgb.XGBRegressor(n_jobs=-1, random_state=AppConfig.RANDOM_SEED, importance_type='total_gain')
            
            search = RandomizedSearchCV(
                xgb_base, 
                param_distributions=param_dist, 
                n_iter=20, 
                scoring=scoring_metric, 
                cv=5, 
                verbose=1, 
                random_state=AppConfig.RANDOM_SEED,
                n_jobs=-1
            )
            
            try:
                search.fit(X_train, y_train)
                tuned_model = search.best_estimator_
                logger.info(f"最佳参数搜索完成: {search.best_params_}")
                
                # 验证调优模型
                y_pred_tuned = tuned_model.predict(X_test)
                tuned_r2 = r2_score(y_test, y_pred_tuned)
                tuned_mae = mean_absolute_error(y_test, y_pred_tuned)
                
                logger.info(f"调优后验证 -> Tuned: R²={tuned_r2:.4f}, MAE={tuned_mae:.4f} | Default: R²={initial_r2:.4f}, MAE={initial_mae:.4f}")
                
                # [核心逻辑] 根据指定的 Metric 决定 Champion
                is_better = False
                if metric == 'r2':
                    if tuned_r2 > initial_r2: is_better = True
                else: # metric == 'mae'
                    if tuned_mae < initial_mae: is_better = True
                
                if is_better:
                    logger.info("  -> 调优模型胜出！采用新模型。")
                    self.model = tuned_model
                    self.r2_score = tuned_r2
                    self.mae = tuned_mae
                else:
                    logger.warning("  -> 调优模型未在指定指标上超越默认模型，保持原样。")
                    # 保持 default
                    
            except Exception as e:
                logger.error(f"调优过程出错，回退到默认模型: {e}")
                # 保持 default

        else:
            logger.info(f"模型性能良好 (R²: {initial_r2:.4f})，无需调优。")

        logger.info(f"最终采用模型 R²: {self.r2_score:.4f}, MAE: {self.mae:.4f}")
        if self.r2_score < 0.3:
            logger.warning("!!! 警报: 模型拟合度较低。请检查数据源质量。")

# ==========================================
# 4. 洞察引擎层：SHAP 解释 (Insight Engine)
# ==========================================
class InsightEngine:
    """负责计算 SHAP 值。"""
    def __init__(self, model, X: pd.DataFrame):
        self.model = model
        self.X = X

    def compute(self, y: Optional[pd.Series] = None):
        logger.info("正在初始化 SHAP Explainer...")
        try:
            X_sample = self.X
            y_sample = y
            if len(self.X) > AppConfig.SHAP_SAMPLE_LIMIT:
                logger.info(f"样本量较大，进行抽样 ({AppConfig.SHAP_SAMPLE_LIMIT})...")
                sample_indices = self.X.sample(n=AppConfig.SHAP_SAMPLE_LIMIT, random_state=AppConfig.RANDOM_SEED).index
                X_sample = self.X.loc[sample_indices]
                if y is not None:
                    y_sample = y.loc[sample_indices]

            try:
                explainer = shap.Explainer(self.model, X_sample)
            except TypeError as error:
                error_message = str(error)
                if 'cannot be analyzed directly' not in error_message:
                    raise
                logger.warning("通用 SHAP Explainer 不兼容当前模型，回退到 TreeExplainer")
                try:
                    explainer = shap.TreeExplainer(self.model)
                except ValueError as tree_error:
                    tree_error_message = str(tree_error)
                    if 'could not convert string to float' not in tree_error_message:
                        raise
                    logger.warning("TreeExplainer 与当前 XGBoost 版本不兼容，回退到 predict 函数 Explainer")
                    explainer = shap.Explainer(self.model.predict, X_sample)
            shap_values = explainer(X_sample)
            return X_sample, y_sample, shap_values
        except Exception as e:
            logger.error(f"SHAP 计算错误: {str(e)}")
            raise

# ==========================================
# 5. 视觉展现层：绘图工场 (Visual Studio)
# ==========================================
class VisualStudio:
    """
    负责图表绘制。
    [优化] 
    1. 修复 full_report_mode 下顶部图表重叠 Bug：改为垂直排列。
    2. 在标题中显示 R2 和 MAE。
    """
    @staticmethod
    def _resolve_plot_style() -> str:
        available_styles = set(plt.style.available)
        for style_name in ('seaborn-v0_8-whitegrid', 'seaborn-whitegrid', 'seaborn'):
            if style_name in available_styles:
                return style_name
        return 'default'

    @staticmethod
    def _call_shap_plot(plot_func, *args, fallback_current_axis=None, **kwargs):
        current_kwargs = dict(kwargs)
        unsupported_kwargs = ('ax', 'plot_size')

        while True:
            try:
                if fallback_current_axis is not None:
                    plt.sca(fallback_current_axis)
                return plot_func(*args, **current_kwargs)
            except TypeError as error:
                message = str(error)
                unsupported_name = next(
                    (
                        name
                        for name in unsupported_kwargs
                        if f"unexpected keyword argument '{name}'" in message and name in current_kwargs
                    ),
                    None,
                )
                if unsupported_name is None:
                    raise
                current_kwargs.pop(unsupported_name, None)

    @staticmethod
    def _draw_report(shap_values, X_sample, y_sample, feature_names, 
                     show_actual_y: bool, full_report_mode: bool, 
                     model_r2: float, model_mae: float,
                     target_name: str = "Target"):
        """内部绘图核心逻辑 (共享于文件保存与 Base64 生成)"""
        n_features = len(feature_names)
        
        # 1. 动态计算画布尺寸，避免完整报告在高特征数下出现极端放大
        if full_report_mode:
            summary_unit_height = max(6, n_features * 0.4)
            summary_section_height = summary_unit_height * 2
            
            plots_per_row = 3
            n_rows = math.ceil(n_features / plots_per_row)
            detail_height = n_rows * 4.5
            
            total_height = summary_section_height + detail_height + 3
            fig_size = (AppConfig.BASE_FIGURE_WIDTH, int(total_height))
            beeswarm_max_display = n_features 
        else:
            fig_size = (24, 18)
            beeswarm_max_display = 15
            n_rows = 1 
            detail_height = 6.0

        # 2. 初始化绘图
        with sns.plotting_context("notebook", font_scale=AppConfig.FONT_SCALE):
            SystemContext._fix_matplotlib_chinese()
            
            # SHAP 图在 constrained layout 下容易挤压并放大文本，改用手动留白控制。
            fig = plt.figure(figsize=fig_size, dpi=AppConfig.DPI)
            
            # 3. 构造增强标题
            if len(feature_names) > 5 and not full_report_mode:
                x_desc = ", ".join(feature_names[:5]) + f", ... (共{len(feature_names)}个)"
            else:
                x_desc = ", ".join(feature_names) 
            
            title_text = (
                f"智能归因分析深度报告 {'(完整版)' if full_report_mode else ''}\n"
                f"Target: {target_name} | Features: {n_features} | Model Performance: R²={model_r2:.4f}, MAE={model_mae:.4f}\n"
                f"Input X: {x_desc}\n"
                f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            )
            fig.suptitle(title_text, fontsize=24, fontweight='bold')

            # 4. 定义 GridSpec
            if full_report_mode:
                height_ratios = [summary_unit_height, summary_unit_height, detail_height]
                gs = fig.add_gridspec(3, 1, height_ratios=height_ratios)
                ax_beeswarm = fig.add_subplot(gs[0, 0])
                ax_bar = fig.add_subplot(gs[1, 0])
                gs_bottom = gs[2].subgridspec(n_rows, 3)
            else:
                gs = fig.add_gridspec(3, 2)
                ax_beeswarm = fig.add_subplot(gs[0, 0])
                ax_bar = fig.add_subplot(gs[0, 1])

            # --- 绘制 Summary ---
            plt.sca(ax_beeswarm)
            ax_beeswarm.set_title("【全局概览】关键因子影响力度与方向 (Beeswarm)", fontsize=22, fontweight='bold', pad=20)
            VisualStudio._call_shap_plot(
                shap.plots.beeswarm,
                shap_values,
                max_display=beeswarm_max_display,
                ax=ax_beeswarm,
                show=False,
                plot_size=None,
                fallback_current_axis=ax_beeswarm,
            )
            ax_beeswarm.set_xlabel("SHAP Value (对结果的影响值)", fontsize=18)

            plt.sca(ax_bar)
            ax_bar.set_title("【量化排名】特征平均绝对贡献度 (Importance Bar)", fontsize=22, fontweight='bold', pad=20)
            VisualStudio._call_shap_plot(
                shap.plots.bar,
                shap_values,
                max_display=beeswarm_max_display,
                ax=ax_bar,
                show=False,
                fallback_current_axis=ax_bar,
            )
            ax_bar.set_xlabel("Mean |SHAP Value| (平均影响幅度)", fontsize=18)

            # --- 绘制 Details ---
            mean_shap = np.abs(shap_values.values).mean(axis=0)
            top_indices = np.argsort(-mean_shap)
            features_to_plot_indices = top_indices if full_report_mode else top_indices[:4]

            def plot_dependence(ax, rank, feat_idx):
                feat_name = feature_names[feat_idx]
                if show_actual_y and y_sample is not None:
                    ax.set_title(f"【No.{rank}】{feat_name} vs 实际值", fontsize=18, fontweight='bold', pad=15)
                    x_data = X_sample[feat_name]
                    y_data = y_sample
                    c_data = shap_values[:, feat_name].values 
                    try:
                        sc = ax.scatter(x_data, y_data, c=c_data, cmap='coolwarm', alpha=0.7, edgecolors='w', linewidth=0.5, s=60)
                        plt.colorbar(sc, ax=ax, fraction=0.046, pad=0.04)
                        mask = ~np.isnan(x_data) & ~np.isnan(y_data)
                        if np.sum(mask) > 5:
                            z = np.polyfit(x_data[mask], y_data[mask], 2)
                            p = np.poly1d(z)
                            x_range = np.linspace(x_data.min(), x_data.max(), 100)
                            ax.plot(x_range, p(x_range), "r--", linewidth=2, alpha=0.8)
                        ax.set_xlabel(feat_name, fontsize=14)
                        ax.set_ylabel("Actual Y", fontsize=14)
                    except Exception as e:
                        ax.text(0.5, 0.5, "Error", ha='center')
                else:
                    ax.set_title(f"【No.{rank}】{feat_name} vs SHAP", fontsize=18, fontweight='bold', pad=15)
                    try:
                        VisualStudio._call_shap_plot(
                            shap.plots.scatter,
                            shap_values[:, feat_name],
                            ax=ax,
                            show=False,
                            color=shap_values,
                            fallback_current_axis=ax,
                        )
                        ax.set_ylabel("SHAP", fontsize=14)
                        ax.set_xlabel(feat_name, fontsize=14)
                    except Exception as e:
                        ax.text(0.5, 0.5, "N/A", ha='center')

            for i, feat_idx in enumerate(features_to_plot_indices):
                rank = i + 1
                if full_report_mode:
                    ax = fig.add_subplot(gs_bottom[i // 3, i % 3])
                else:
                    plot_locs = [(1, 0), (1, 1), (2, 0), (2, 1)]
                    if i < 4: ax = fig.add_subplot(gs[plot_locs[i][0], plot_locs[i][1]])
                    else: continue
                plot_dependence(ax, rank, feat_idx)

            # 某些 SHAP 版本会在绘图过程中重置 figure 尺寸，导致完整报告被压成小图。
            fig.set_size_inches(fig_size[0], fig_size[1], forward=True)
            fig.subplots_adjust(top=0.9, hspace=0.35)
            
            return fig

    @staticmethod
    def generate_report(shap_values, X_sample, y_sample, feature_names, output_dir: str, filename: str, 
                        show_actual_y: bool, full_report_mode: bool, 
                        model_r2: float, model_mae: float):
        logger.info(f"正在渲染分析报表 (全量模式: {full_report_mode})...")
        target_name = y_sample.name if hasattr(y_sample, 'name') else "Target"
        
        with plt.style.context(VisualStudio._resolve_plot_style()):
            fig = VisualStudio._draw_report(
                shap_values, X_sample, y_sample, feature_names,
                show_actual_y, full_report_mode, model_r2, model_mae, target_name
            )
            save_path = os.path.join(output_dir, filename)
            fig.savefig(save_path, dpi=AppConfig.DPI) 
            logger.info(f"报表已保存至: {save_path}")
            plt.close(fig)

    @staticmethod
    def get_beeswarm_base64(shap_values, X, max_display=15):
        """生成蜂群图并返回 base64 字符串"""
        with plt.style.context(VisualStudio._resolve_plot_style()):
            SystemContext._fix_matplotlib_chinese()
            fig = plt.figure(figsize=(10, 6), dpi=100)
            ax = fig.add_subplot(111)
            shap.summary_plot(shap_values.values, X, plot_type="dot", show=False, max_display=max_display)
            plt.tight_layout()
            
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)
            img_base64 = base64.b64encode(buf.read()).decode('utf-8')
            plt.close(fig)
            return img_base64

    @staticmethod
    def get_dependence_plot_base64(shap_values, X, feature_name):
        """生成指定特征的依赖图并返回 base64 字符串"""
        with plt.style.context(VisualStudio._resolve_plot_style()):
            SystemContext._fix_matplotlib_chinese()
            fig = plt.figure(figsize=(8, 5), dpi=100)
            ax = fig.add_subplot(111)
            VisualStudio._call_shap_plot(
                shap.dependence_plot,
                feature_name,
                shap_values.values,
                X,
                ax=ax,
                show=False,
                fallback_current_axis=ax,
            )
            plt.tight_layout()
            
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)
            img_base64 = base64.b64encode(buf.read()).decode('utf-8')
            plt.close(fig)
            return img_base64

    @staticmethod
    def get_full_report_base64(shap_values, X, y, model_r2: float, model_mae: float, target_col: str = "Target"):
        """生成整合好的完整报表并返回 base64 字符串"""
        feature_names = X.columns.tolist()
        with plt.style.context(VisualStudio._resolve_plot_style()):
            fig = VisualStudio._draw_report(
                shap_values, X, y, feature_names,
                show_actual_y=False, full_report_mode=True, 
                model_r2=model_r2, model_mae=model_mae, target_name=target_col
            )
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=AppConfig.DPI)
            buf.seek(0)
            img_base64 = base64.b64encode(buf.read()).decode('utf-8')
            plt.close(fig)
            return img_base64

# ==========================================
# 6. 演示生成器 (Demo Generator)
# ==========================================
class DemoGenerator:
    """生成用于测试的高质量仿真数据"""
    @staticmethod
    def create_demo_data(n=1000) -> Tuple[pd.DataFrame, str]:
        np.random.seed(AppConfig.RANDOM_SEED)
        data = {
            'Material_Density': np.random.normal(10, 1, n),
            'Coating_Thickness': np.random.normal(10, 1, n),
            'Temperature': np.random.uniform(20, 100, n),
            'Pressure': np.random.normal(50, 5, n),
            'Impurity_Content': np.random.exponential(2, n),
            'Operator': np.random.choice(['A', 'B', 'C'], n),
            'Noise_1': np.random.normal(0, 1, n),
            'Noise_2': np.random.normal(0, 1, n),
            'Extra_Sensor_A': np.random.normal(5, 1, n),
            'Extra_Sensor_B': np.random.normal(5, 1, n),
            'Noise_3': np.random.normal(10, 2, n),
            'Noise_4': np.random.normal(10, 2, n),
            'Noise_5': np.random.normal(10, 2, n),
        }
        data['Material_Density'][0:10] = 999 
        
        df = pd.DataFrame(data)
        y = 3 * df['Material_Density'] 
        y += -5 * ((df['Coating_Thickness'] - 10)**2)
        y += -0.5 * df['Pressure'] * (df['Temperature'] > 80).astype(int)
        y += -50 * (df['Impurity_Content'] > 8).astype(int)
        y += 5 * (df['Operator'] == 'B').astype(int)
        y += np.random.normal(0, 2, n)
        
        df['Quality_Score'] = y
        return df, 'Quality_Score'

# ==========================================
# 7. 主程序外观 (Facade)
# ==========================================
class RobustAnalyzerTool:
    """工具入口类"""
    def __init__(self):
        pass 
        
    def run_analysis(self, 
                     file_path: Optional[str] = None, 
                     target_column: Optional[str] = None, 
                     is_demo: bool = False,
                     include_cols: Optional[List[str]] = None,
                     exclude_cols: Optional[List[str]] = None,
                     use_regex: bool = True,
                     clean_outliers: Optional[str] = None, 
                     show_actual_y: bool = True,
                     output_dir: Optional[str] = None,
                     output_filename: Optional[str] = None,
                     optimization_metric: str = 'r2',
                     full_report_mode: bool = False,
                     target_scale_factor: float = 1.0):
        try:
            # 0. 确定输出路径
            final_output_dir = output_dir if output_dir else AppConfig.DEFAULT_OUTPUT_DIR
            SystemContext.configure_environment(final_output_dir)
            
            logger.info("="*50)
            logger.info("   智能归因分析工具 (Robust Insight Tool) v5.2   ")
            logger.info("="*50)

            # 1. 数据获取
            df = None
            target = target_column
            
            if is_demo:
                logger.info("模式: 演示模式 (Demo Mode)")
                df, target = DemoGenerator.create_demo_data()
            else:
                if not file_path or not target:
                    raise ValueError("非演示模式必须提供 file_path 和 target_column")
                logger.info(f"模式: 文件分析模式 (File Mode) -> {file_path}")
                temp_engine = DataEngine(target_col=target) 
                df = temp_engine.load_data(file_path)

            # 2. 数据处理
            engine = DataEngine(
                target_col=target, 
                include_cols=include_cols, 
                exclude_cols=exclude_cols, 
                use_regex=use_regex,
                clean_outliers_method=clean_outliers
            )
            df_clean = engine.load_data(df) 
            X, y = engine.get_X_y(df_clean)

            # [New Feature] Target Scaling
            if target_scale_factor != 1.0:
                logger.info(f"应用目标值缩放: 原始值 * {target_scale_factor}")
                y = y * target_scale_factor

            # 3. 模型训练
            model_core = ModelCore()
            model_core.train(X, y, metric=optimization_metric)

            # 4. 解释分析
            insight = InsightEngine(model_core.model, X)
            X_sample, y_sample, shap_values = insight.compute(y)

            # 5. 生成报表
            if not output_filename:
                prefix = "demo" if is_demo else os.path.basename(file_path).split('.')[0]
                suffix = "full" if full_report_mode else "summary"
                output_filename = f"{prefix}_{suffix}_report.png"
            
            # [Fix] 传递 model_r2 和 model_mae
            VisualStudio.generate_report(
                shap_values, X_sample, y_sample, engine.feature_names, 
                final_output_dir, output_filename, show_actual_y,
                full_report_mode,
                model_r2=model_core.r2_score,
                model_mae=model_core.mae
            )

            logger.info("="*50)
            logger.info(f"分析完成！请查看: {os.path.join(final_output_dir, output_filename)}")
            logger.info("="*50)

        except Exception as e:
            logger.critical(f"程序运行中断: {e}", exc_info=True)
            print(f"\n[Error] 分析过程中发生错误: {e}\n详情请查看日志。")

# ==========================================
# 8. 执行入口
# ==========================================
if __name__ == "__main__":
    tool = RobustAnalyzerTool()
    
    # --- 场景演示 ---
    tool.run_analysis(
        is_demo=True,
        clean_outliers='isolation_forest', 
        show_actual_y=False,
        exclude_cols=['^Extra_.*', 'Noise_1'],
        optimization_metric='mae',
        full_report_mode=True,
        target_scale_factor=100.0 # [演示] 将 Y 放大 100 倍
    )
