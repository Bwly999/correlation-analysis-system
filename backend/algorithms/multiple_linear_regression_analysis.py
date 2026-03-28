from typing import Any, Dict, Iterable

import numpy as np
from scipy.stats import t as student_t
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

from .common import prepare_regression_dataset

RANDOM_SEED = 42


def _round_float(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def analyze_multiple_linear_regression(
    data: Iterable[Dict[str, Any]], target: str, config: Dict[str, Any]
) -> Dict[str, Any]:
    feature_names = config.get('factorNames')
    prepared = prepare_regression_dataset(data, target_col=target, feature_names=feature_names)

    if prepared.sample_count < 10:
        raise ValueError('有效数据过少，无法执行多元线性回归')

    if prepared.target.nunique() < 2:
        raise ValueError('目标字段缺少有效波动，无法执行多元线性回归')

    X = prepared.features.to_numpy(dtype=float)
    y = prepared.target.to_numpy(dtype=float)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_SEED,
    )

    if len(X_train) <= X.shape[1]:
        raise ValueError('有效训练样本过少，无法执行多元线性回归')

    model = LinearRegression()
    model.fit(X_train, y_train)
    test_predictions = model.predict(X_test)

    design_matrix = np.column_stack([np.ones(len(X)), X])
    beta, _, _, _ = np.linalg.lstsq(design_matrix, y, rcond=None)
    fitted = design_matrix @ beta
    residuals = y - fitted

    sample_count = len(y)
    feature_count = X.shape[1]
    degrees_of_freedom = sample_count - feature_count - 1
    if degrees_of_freedom <= 0:
        raise ValueError('有效样本不足，无法计算多元线性回归统计量')

    xtx_inverse = np.linalg.pinv(design_matrix.T @ design_matrix)
    mse = float((residuals @ residuals) / degrees_of_freedom)
    standard_errors = np.sqrt(np.diag(mse * xtx_inverse))
    t_values = np.divide(
        beta,
        standard_errors,
        out=np.zeros_like(beta),
        where=standard_errors > 0,
    )
    p_values = 2 * (1 - student_t.cdf(np.abs(t_values), degrees_of_freedom))

    r2 = r2_score(y_test, test_predictions)
    adjusted_r2 = 1 - (1 - r2) * (len(y_test) - 1) / max(len(y_test) - feature_count - 1, 1)

    coefficients = [
        {
            'name': feature_name,
            'coefficient': _round_float(beta[index + 1]),
            'absCoefficient': _round_float(abs(beta[index + 1])),
            'pValue': _round_float(p_values[index + 1]),
        }
        for index, feature_name in enumerate(prepared.feature_names)
    ]
    coefficients.sort(key=lambda item: item['absCoefficient'], reverse=True)
    for index, item in enumerate(coefficients, start=1):
        item['rank'] = index

    return {
        'summary': {
            'targetField': target,
            'sampleCount': prepared.sample_count,
            'featureCount': len(prepared.feature_names),
            'r2': _round_float(r2, 4),
            'adjustedR2': _round_float(adjusted_r2, 4),
            'mae': _round_float(mean_absolute_error(y_test, test_predictions), 4),
            'intercept': _round_float(beta[0]),
        },
        'coefficients': coefficients,
        'predictions': {
            'actual': [_round_float(value) for value in y_test.tolist()],
            'predicted': [_round_float(value) for value in test_predictions.tolist()],
        },
        'residuals': {
            'fitted': [_round_float(value) for value in fitted.tolist()],
            'residuals': [_round_float(value) for value in residuals.tolist()],
        },
    }
