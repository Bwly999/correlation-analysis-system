from typing import Any, Dict, Iterable, List

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

from .common import prepare_regression_dataset

RANDOM_SEED = 42
DEFAULT_N_ESTIMATORS = 200
DEFAULT_MAX_DEPTH = 8


def _round_float(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def _normalize_positive_int(value: Any, fallback: int) -> int:
    parsed = int(value) if value is not None else fallback
    return parsed if parsed > 0 else fallback


def _build_risks(importance: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not importance:
        return []

    top_value = float(importance[0]['value'])
    second_value = float(importance[1]['value']) if len(importance) > 1 else 0.0
    cumulative_top_two = top_value + second_value

    risks: List[Dict[str, Any]] = []
    if top_value >= 0.6:
        risks.append(
            {
                'code': 'top_feature_dominance',
                'level': 'low',
                'title': '头部因子贡献集中',
                'message': f"当前最重要因子 {importance[0]['name']} 的重要性占比达到 {_round_float(top_value, 4)}，建议优先结合业务重点排查。",
            }
        )

    if cumulative_top_two < 0.6:
        risks.append(
            {
                'code': 'flat_importance_distribution',
                'level': 'medium',
                'title': '重要性分布较平',
                'message': '多个因子的重要性较为接近，建议不要只根据单一排序结论做删减。',
            }
        )

    return risks


def analyze_random_forest_feature_importance(
    data: Iterable[Dict[str, Any]], target: str, config: Dict[str, Any]
) -> Dict[str, Any]:
    feature_names = config.get('factorNames')
    prepared = prepare_regression_dataset(data, target_col=target, feature_names=feature_names)

    if prepared.sample_count < 10:
        raise ValueError('有效数据过少，无法执行随机森林特征重要性分析')

    if prepared.target.nunique() < 2:
        raise ValueError('目标字段缺少有效波动，无法执行随机森林特征重要性分析')

    X = prepared.features.to_numpy(dtype=float)
    y = prepared.target.to_numpy(dtype=float)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_SEED,
    )

    if len(X_train) < 8:
        raise ValueError('有效训练样本过少，无法执行随机森林特征重要性分析')

    n_estimators = _normalize_positive_int(config.get('nEstimators'), DEFAULT_N_ESTIMATORS)
    max_depth = _normalize_positive_int(config.get('maxDepth'), DEFAULT_MAX_DEPTH)

    model = RandomForestRegressor(
        n_estimators=n_estimators,
        max_depth=max_depth,
        random_state=RANDOM_SEED,
        n_jobs=1,
    )
    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    sorted_pairs = sorted(
        zip(prepared.feature_names, model.feature_importances_),
        key=lambda item: item[1],
        reverse=True,
    )

    importance = []
    cumulative_importance = []
    cumulative_value = 0.0
    for index, (feature_name, value) in enumerate(sorted_pairs, start=1):
        rounded_value = _round_float(value)
        cumulative_value += value
        importance.append(
            {
                'name': feature_name,
                'value': rounded_value,
                'rank': index,
            }
        )
        cumulative_importance.append(
            {
                'name': feature_name,
                'cumulativeValue': _round_float(cumulative_value),
                'rank': index,
            }
        )

    risks = _build_risks(importance)

    return {
        'summary': {
            'targetField': target,
            'sampleCount': prepared.sample_count,
            'featureCount': len(prepared.feature_names),
            'r2': _round_float(r2_score(y_test, predictions), 4),
            'mae': _round_float(mean_absolute_error(y_test, predictions), 4),
            'nEstimators': n_estimators,
            'maxDepth': max_depth,
        },
        'importance': importance,
        'cumulativeImportance': cumulative_importance,
        'predictions': {
            'actual': [_round_float(value) for value in y_test.tolist()],
            'predicted': [_round_float(value) for value in predictions.tolist()],
        },
        'risks': risks,
    }
