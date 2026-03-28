from typing import Any, Dict, List

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from backend.algorithms.lasso_analysis import analyze_lasso as run_lasso_analysis
    from backend.algorithms.multiple_linear_regression_analysis import (
        analyze_multiple_linear_regression as run_multiple_linear_regression_analysis,
    )
    from backend.algorithms.random_forest_feature_importance_analysis import (
        analyze_random_forest_feature_importance as run_random_forest_feature_importance_analysis,
    )
    from backend.algorithms.xgboost_shap_analysis import (
        analyze_xgboost_shap as run_xgboost_shap_analysis,
    )
except ImportError:
    from algorithms.lasso_analysis import analyze_lasso as run_lasso_analysis
    from algorithms.multiple_linear_regression_analysis import (
        analyze_multiple_linear_regression as run_multiple_linear_regression_analysis,
    )
    from algorithms.random_forest_feature_importance_analysis import (
        analyze_random_forest_feature_importance as run_random_forest_feature_importance_analysis,
    )
    from algorithms.xgboost_shap_analysis import (
        analyze_xgboost_shap as run_xgboost_shap_analysis,
    )


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


def _success_response(results: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'status': 'success',
        'results': results,
    }


@app.post('/analyze/xgboost-shap')
async def analyze_xgboost_shap(
    data: List[Dict[str, Any]] = Body(...),
    target: str = Body(...),
    config: Dict[str, Any] = Body({}),
):
    try:
        return _success_response(run_xgboost_shap_analysis(data, target, config))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except HTTPException as error:
        raise error
    except Exception as error:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f'算法执行失败: {str(error)}')


@app.post('/analyze/lasso')
async def analyze_lasso(
    data: List[Dict[str, Any]] = Body(...),
    target: str = Body(...),
    config: Dict[str, Any] = Body({}),
):
    try:
        return _success_response(run_lasso_analysis(data, target, config))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except HTTPException as error:
        raise error
    except Exception as error:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f'算法执行失败: {str(error)}')


@app.post('/analyze/multiple-linear-regression')
async def analyze_multiple_linear_regression(
    data: List[Dict[str, Any]] = Body(...),
    target: str = Body(...),
    config: Dict[str, Any] = Body({}),
):
    try:
        return _success_response(run_multiple_linear_regression_analysis(data, target, config))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except HTTPException as error:
        raise error
    except Exception as error:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f'算法执行失败: {str(error)}')


@app.post('/analyze/random-forest-feature-importance')
async def analyze_random_forest_feature_importance(
    data: List[Dict[str, Any]] = Body(...),
    target: str = Body(...),
    config: Dict[str, Any] = Body({}),
):
    try:
        return _success_response(run_random_forest_feature_importance_analysis(data, target, config))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except HTTPException as error:
        raise error
    except Exception as error:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f'算法执行失败: {str(error)}')


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=8000)
