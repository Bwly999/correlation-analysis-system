from math import exp
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler


RANDOM_SEED = 42


def _round_float(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def _normalize_positive_float(value: Any, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def _normalize_positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def _prepare_classification_dataset(
    source: Iterable[Dict[str, Any]],
    target_col: str,
    feature_names: Optional[List[str]] = None,
):
    frame = pd.DataFrame(list(source))
    if frame.empty:
        raise ValueError('未提供可分析的数据')
    if target_col not in frame.columns:
        raise ValueError(f"目标字段 '{target_col}' 不存在")

    candidate_names = feature_names or [column for column in frame.columns if column != target_col]
    candidate_names = [name for name in candidate_names if name in frame.columns and name != target_col]
    if not candidate_names:
        raise ValueError('未提供可用于分类建模的特征字段')

    target_series = frame[target_col].astype('string').fillna('').str.strip()
    valid_mask = target_series != ''
    filtered_frame = frame.loc[valid_mask, candidate_names].reset_index(drop=True)
    filtered_target = target_series.loc[valid_mask].reset_index(drop=True)

    if filtered_frame.empty:
        raise ValueError('有效样本不足，无法执行逻辑回归分类分析')
    if filtered_target.nunique() < 2:
        raise ValueError('目标标签至少需要 2 个有效类别才能执行逻辑回归分类分析')

    numeric_features = [
        column for column in candidate_names if pd.api.types.is_numeric_dtype(filtered_frame[column])
    ]
    categorical_features = [column for column in candidate_names if column not in numeric_features]

    return filtered_frame, filtered_target, candidate_names, numeric_features, categorical_features


def _build_risks(y_train: pd.Series, y_test: pd.Series, metrics: Dict[str, Any]) -> List[Dict[str, Any]]:
    risks: List[Dict[str, Any]] = []
    counts = y_train.value_counts()
    min_class = int(counts.min())
    max_class = int(counts.max())

    if min_class > 0 and max_class / min_class >= 3:
        risks.append(
            {
                'code': 'class_imbalance',
                'level': 'medium',
                'title': '类别分布不均衡',
                'message': '训练集中类别分布不均衡，建议结合混淆矩阵重点检查少数类表现。',
            }
        )

    if metrics['accuracy'] < 0.7:
        risks.append(
            {
                'code': 'low_accuracy',
                'level': 'warning',
                'title': '模型区分能力偏弱',
                'message': '当前 Accuracy 低于 0.7，建议重新筛选因子或检查标签定义是否稳定。',
            }
        )

    if y_test.nunique() < y_train.nunique():
        risks.append(
            {
                'code': 'missing_test_class',
                'level': 'warning',
                'title': '测试集类别覆盖不完整',
                'message': '测试集未覆盖全部类别，部分多分类指标的解释需谨慎。',
            }
        )

    return risks


def analyze_logistic_regression_classification(
    data: Iterable[Dict[str, Any]], target: str, config: Dict[str, Any]
) -> Dict[str, Any]:
    feature_names = config.get('factorNames')
    if feature_names is not None and not isinstance(feature_names, list):
        feature_names = None

    frame, labels, selected_features, numeric_features, categorical_features = _prepare_classification_dataset(
        data, target, feature_names
    )

    if len(frame) < 20:
        raise ValueError('有效样本过少，无法执行逻辑回归分类分析')

    label_encoder = LabelEncoder()
    encoded_labels = label_encoder.fit_transform(labels)
    class_names = label_encoder.classes_.tolist()
    class_count = len(class_names)

    test_size = config.get('testSize', 0.2)
    try:
        normalized_test_size = float(test_size)
    except (TypeError, ValueError):
        normalized_test_size = 0.2
    if normalized_test_size <= 0 or normalized_test_size >= 0.5:
        normalized_test_size = 0.2

    label_counts = pd.Series(encoded_labels).value_counts()
    stratify = encoded_labels if int(label_counts.min()) >= 2 else None

    X_train, X_test, y_train, y_test = train_test_split(
        frame,
        encoded_labels,
        test_size=normalized_test_size,
        random_state=RANDOM_SEED,
        stratify=stratify,
    )

    if len(X_train) < 10 or len(set(y_train)) < 2:
        raise ValueError('有效训练样本不足，无法执行逻辑回归分类分析')

    numeric_pipeline = Pipeline(
        steps=[
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore')),
        ]
    )

    preprocess = ColumnTransformer(
        transformers=[
            ('num', numeric_pipeline, numeric_features),
            ('cat', categorical_pipeline, categorical_features),
        ]
    )

    regularization_strength = _normalize_positive_float(config.get('regularizationStrength'), 1.0)
    max_iterations = _normalize_positive_int(config.get('maxIterations'), 1000)

    classifier = LogisticRegression(
        C=regularization_strength,
        max_iter=max_iterations,
        random_state=RANDOM_SEED,
        multi_class='multinomial' if class_count > 2 else 'auto',
        solver='lbfgs',
    )
    model = Pipeline(
        steps=[
            ('preprocess', preprocess),
            ('classifier', classifier),
        ]
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)

    accuracy = accuracy_score(y_test, predictions)
    macro_precision = precision_score(y_test, predictions, average='macro', zero_division=0)
    macro_recall = recall_score(y_test, predictions, average='macro', zero_division=0)
    macro_f1 = f1_score(y_test, predictions, average='macro', zero_division=0)

    precision = None
    recall = None
    f1 = None
    auc = None
    roc = None

    if class_count == 2:
        precision = precision_score(y_test, predictions, average='binary', zero_division=0)
        recall = recall_score(y_test, predictions, average='binary', zero_division=0)
        f1 = f1_score(y_test, predictions, average='binary', zero_division=0)
        auc = roc_auc_score(y_test, probabilities[:, 1])
        fpr, tpr, _ = roc_curve(y_test, probabilities[:, 1])
        roc = {
            'fpr': [_round_float(value, 6) for value in fpr.tolist()],
            'tpr': [_round_float(value, 6) for value in tpr.tolist()],
        }

    transformed_feature_names = model.named_steps['preprocess'].get_feature_names_out().tolist()
    coefficients_raw = model.named_steps['classifier'].coef_
    coefficients: List[Dict[str, Any]] = []

    if class_count == 2:
        positive_class = class_names[1]
        for feature_name, coefficient in zip(transformed_feature_names, coefficients_raw[0].tolist()):
            coefficients.append(
                {
                    'feature': feature_name,
                    'className': positive_class,
                    'coefficient': _round_float(coefficient, 6),
                    'oddsRatio': _round_float(exp(coefficient), 6),
                }
            )
    else:
        for class_index, class_name in enumerate(class_names):
            for feature_name, coefficient in zip(
                transformed_feature_names, coefficients_raw[class_index].tolist()
            ):
                coefficients.append(
                    {
                        'feature': feature_name,
                        'className': class_name,
                        'coefficient': _round_float(coefficient, 6),
                        'oddsRatio': _round_float(exp(coefficient), 6),
                    }
                )

    coefficients = sorted(coefficients, key=lambda item: abs(item['coefficient']), reverse=True)
    coefficients = [
        {
            **item,
            'rank': index + 1,
        }
        for index, item in enumerate(coefficients[: min(20, len(coefficients))])
    ]

    metrics = {
        'accuracy': _round_float(accuracy, 4),
        'precision': _round_float(precision, 4) if precision is not None else None,
        'recall': _round_float(recall, 4) if recall is not None else None,
        'f1': _round_float(f1, 4) if f1 is not None else None,
        'macroPrecision': _round_float(macro_precision, 4),
        'macroRecall': _round_float(macro_recall, 4),
        'macroF1': _round_float(macro_f1, 4),
        'auc': _round_float(auc, 4) if auc is not None else None,
    }

    risks = _build_risks(pd.Series(y_train), pd.Series(y_test), metrics)
    confusion = confusion_matrix(y_test, predictions, labels=list(range(class_count)))

    return {
        'summary': {
            'targetField': target,
            'sampleCount': int(len(frame)),
            'featureCount': len(selected_features),
            'classCount': class_count,
            'accuracy': metrics['accuracy'],
            'macroF1': metrics['macroF1'],
            'auc': metrics['auc'],
        },
        'metrics': metrics,
        'confusionMatrix': {
            'labels': class_names,
            'matrix': confusion.tolist(),
        },
        'rocCurve': roc,
        'coefficients': coefficients,
        'risks': risks,
    }
