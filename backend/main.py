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
        
        # 排序
        importance_list.sort(key=lambda x: x["value"], reverse=True)
        
        return {
            "status": "success",
            "results": {
                "r2": round(model_core.r2_score, 4),
                "mae": round(model_core.mae, 4),
                "importance": importance_list,
                "message": "分析完成"
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
