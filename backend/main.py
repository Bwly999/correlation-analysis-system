from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import os
import sys
from typing import List, Dict, Any

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from algorithm.robust_insight_tool import DataEngine, ModelCore, InsightEngine, VisualStudio, SystemContext

app = FastAPI(title='Correlation Analysis Backend')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/')
async def root():
    return {'message': 'Correlation Analysis API is running'}


@app.post('/analyze/xgboost-shap')
async def analyze_xgboost_shap(
    data: List[Dict[str, Any]] = Body(...),
    target: str = Body(...),
    config: Dict[str, Any] = Body({}),
):
    try:
        if not data:
            raise HTTPException(status_code=400, detail='未提供可分析的数据')

        df = pd.DataFrame(data)
        if target not in df.columns:
            raise HTTPException(status_code=400, detail=f"目标字段 '{target}' 不存在")

        include_cols = config.get('factorNames', [])
        if not isinstance(include_cols, list):
            include_cols = []

        engine = DataEngine(
            target_col=target,
            include_cols=include_cols if include_cols else None,
            use_regex=False,
        )
        df_clean = engine.load_data(df)
        X, y = engine.get_X_y(df_clean)

        if len(X) < 10:
            raise HTTPException(status_code=400, detail='有效数据过少，无法训练模型')

        model_core = ModelCore()
        model_core.train(X, y, metric='r2')

        insight_engine = InsightEngine(model_core.model, X)
        X_sample, y_sample, shap_values = insight_engine.compute(y)

        feature_names = X_sample.columns.tolist()
        mean_abs_shap = np.abs(shap_values.values).mean(axis=0)
        importance = [
            {
                'name': feature_name,
                'value': float(value),
                'rank': index + 1,
            }
            for index, (feature_name, value) in enumerate(
                sorted(zip(feature_names, mean_abs_shap), key=lambda item: item[1], reverse=True)
            )
        ]

        dependence = []
        dependence_images = []
        for feature_name in feature_names:
            feature_index = feature_names.index(feature_name)
            dependence.append(
                {
                    'feature': feature_name,
                    'x': X_sample[feature_name].values.tolist(),
                    'shap': shap_values.values[:, feature_index].tolist(),
                    'actualY': y_sample.tolist() if y_sample is not None else [],
                    'xRange': [
                        float(np.min(X_sample[feature_name].values)),
                        float(np.max(X_sample[feature_name].values)),
                    ],
                    'shapRange': [
                        float(np.min(shap_values.values[:, feature_index])),
                        float(np.max(shap_values.values[:, feature_index])),
                    ],
                }
            )
            dependence_images.append(
                {
                    'feature': feature_name,
                    'image': VisualStudio.get_dependence_plot_base64(shap_values, X_sample, feature_name),
                }
            )

        SystemContext._fix_matplotlib_chinese()
        import matplotlib.pyplot as plt

        plt.close('all')

        beeswarm_image = VisualStudio.get_beeswarm_base64(shap_values, X_sample)
        full_report_image = VisualStudio.get_full_report_base64(
            shap_values,
            X_sample,
            y_sample,
            model_r2=model_core.r2_score,
            model_mae=model_core.mae,
            target_col=target,
        )

        return {
            'status': 'success',
            'results': {
                'summary': {
                    'targetField': target,
                    'sampleCount': int(len(X_sample)),
                    'featureCount': int(len(feature_names)),
                    'r2': round(model_core.r2_score, 4),
                    'mae': round(model_core.mae, 4),
                },
                'importance': importance,
                'dependence': dependence,
                'assets': {
                    'beeswarmImage': beeswarm_image,
                    'fullReportImage': full_report_image,
                    'dependenceImages': dependence_images,
                },
                'message': '分析完成',
            },
        }
    except HTTPException as error:
        raise error
    except Exception as error:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f'算法执行失败: {str(error)}')


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=8000)
