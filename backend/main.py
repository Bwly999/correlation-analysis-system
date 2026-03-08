from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import os
import sys
from typing import List, Dict, Any

# 添加当前目录到路径，以便导入算法工具
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from algorithm.robust_insight_tool import DataEngine, ModelCore, InsightEngine

app = FastAPI(title="Correlation Analysis Backend")

# 配置 CORS，允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Correlation Analysis API is running"}

@app.post("/analyze/xgboost-shap")
async def analyze_xgboost_shap(
    data: List[Dict[str, Any]] = Body(...),
    target: str = Body(...),
    config: Dict[str, Any] = Body({})
):
    try:
        if not data:
            raise HTTPException(status_code=400, detail="No data provided")
        
        # 将 JSON 数据转换为 DataFrame
        df = pd.DataFrame(data)
        
        if target not in df.columns:
            raise HTTPException(status_code=400, detail=f"Target column '{target}' not found in data")
            
        # 使用算法工具内部的核心层来进行计算
        
        # 1. 数据处理
        engine = DataEngine(target_col=target)
        df_clean = engine.load_data(df)
        X, y = engine.get_X_y(df_clean)
        
        if len(X) < 10:
             raise HTTPException(status_code=400, detail="有效数据过少，无法训练模型")

        # 2. 训练模型
        model_core = ModelCore()
        model_core.train(X, y, metric='r2')
        
        # 3. 计算 SHAP
        insight_engine = InsightEngine(model_core.model, X)
        X_sample, y_sample, shap_values = insight_engine.compute(y)
        
        # 提取 SHAP 重要性 (Mean Absolute SHAP Value)
        # shap_values.values shape: (n_samples, n_features)
        mean_abs_shap = np.abs(shap_values.values).mean(axis=0)
        feature_names = X_sample.columns.tolist()
        
        importance_list = [
            {"name": name, "value": float(val)} 
            for name, val in zip(feature_names, mean_abs_shap)
        ]
        
        # 排序重要性
        importance_list.sort(key=lambda x: x["value"], reverse=True)
        top_features = [item["name"] for item in importance_list[:6]] # 取前6个重要特征做依赖分析

        # 构建蜂群图数据 (Beeswarm)
        # 我们需要：每个点的 (特征值, SHAP值, 特征索引)
        # 为了前端展示方便，我们对特征值进行归一化(0-1)用于颜色映射
        beeswarm_data = {}
        for i, col in enumerate(feature_names):
            f_vals = X_sample[col].values
            s_vals = shap_values.values[:, i]
            
            # 归一化特征值用于颜色映射 (0: Blue, 1: Red)
            f_min, f_max = f_vals.min(), f_vals.max()
            if f_max > f_min:
                f_norm = (f_vals - f_min) / (f_max - f_min)
            else:
                f_norm = np.zeros_like(f_vals)
                
            beeswarm_data[col] = {
                "values": f_vals.tolist(),
                "shap_values": s_vals.tolist(),
                "norm_values": f_norm.tolist()
            }

        # 构建依赖图数据 (Dependence)
        dependence_plots = []
        for feat in top_features:
            feat_idx = feature_names.index(feat)
            dependence_plots.append({
                "feature": feat,
                "x": X_sample[feat].tolist(),
                "shap": shap_values.values[:, feat_idx].tolist(),
                "actual_y": y_sample.tolist() if y_sample is not None else []
            })
        
        return {
            "status": "success",
            "results": {
                "r2": round(model_core.r2_score, 4),
                "mae": round(model_core.mae, 4),
                "importance": importance_list,
                "beeswarm": beeswarm_data,
                "dependence": dependence_plots,
                "message": "分析完成"
            }
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"算法执行失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
