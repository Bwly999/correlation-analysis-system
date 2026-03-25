from typing import Any, Dict, Iterable

import numpy as np
from sklearn.linear_model import Lasso, LassoCV, lasso_path
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from .common import prepare_regression_dataset

RANDOM_SEED = 42


def _round_float(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def analyze_lasso(data: Iterable[Dict[str, Any]], target: str, config: Dict[str, Any]) -> Dict[str, Any]:
    feature_names = config.get('factorNames')
    prepared = prepare_regression_dataset(data, target_col=target, feature_names=feature_names)

    if prepared.sample_count < 10:
        raise ValueError('有效数据过少，无法执行 Lasso 回归')

    if prepared.target.nunique() < 2:
        raise ValueError('目标字段缺少有效波动，无法执行 Lasso 回归')

    X = prepared.features.to_numpy(dtype=float)
    y = prepared.target.to_numpy(dtype=float)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_SEED,
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    X_all_scaled = scaler.transform(X)

    cv = min(5, len(X_train_scaled))
    if cv < 2:
        raise ValueError('有效训练样本过少，无法执行交叉验证')

    selector = LassoCV(cv=cv, random_state=RANDOM_SEED, n_alphas=100, max_iter=20000)
    selector.fit(X_train_scaled, y_train)

    predictions = selector.predict(X_test_scaled)
    fitted_model = Lasso(alpha=selector.alpha_, max_iter=20000)
    fitted_model.fit(X_all_scaled, y)

    alpha_grid, coefficient_path, _ = lasso_path(X_all_scaled, y, alphas=None)
    selected_feature_names = [
        feature_name
        for feature_name, coefficient in zip(prepared.feature_names, fitted_model.coef_)
        if not np.isclose(coefficient, 0.0)
    ]

    coefficients = [
        {
            'name': feature_name,
            'coefficient': _round_float(coefficient),
            'absCoefficient': _round_float(abs(coefficient)),
            'selected': not np.isclose(coefficient, 0.0),
        }
        for feature_name, coefficient in zip(prepared.feature_names, fitted_model.coef_)
    ]
    coefficients.sort(key=lambda item: item['absCoefficient'], reverse=True)
    for index, item in enumerate(coefficients, start=1):
        item['rank'] = index

    return {
        'summary': {
            'targetField': target,
            'sampleCount': prepared.sample_count,
            'featureCount': len(prepared.feature_names),
            'selectedFeatureCount': len(selected_feature_names),
            'alpha': _round_float(selector.alpha_),
            'r2': _round_float(r2_score(y_test, predictions), 4),
            'mae': _round_float(mean_absolute_error(y_test, predictions), 4),
        },
        'coefficients': coefficients,
        'selectedFeatures': selected_feature_names,
        'path': {
            'alphas': [_round_float(alpha) for alpha in alpha_grid.tolist()],
            'series': [
                {
                    'feature': feature_name,
                    'coefficients': [_round_float(value) for value in coefficient_path[index].tolist()],
                }
                for index, feature_name in enumerate(prepared.feature_names)
            ],
        },
    }
