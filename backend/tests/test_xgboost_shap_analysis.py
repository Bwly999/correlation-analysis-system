import builtins
import types
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd


class XgboostShapAnalysisTests(unittest.TestCase):
    def test_analyze_xgboost_shap_falls_back_to_local_algorithm_package(self):
        from backend.algorithms.xgboost_shap_analysis import analyze_xgboost_shap

        class FakeDataEngine:
            def __init__(self, target_col, include_cols=None, use_regex=False):
                self.target_col = target_col
                self.include_cols = include_cols or []

            def load_data(self, df):
                return df

            def get_X_y(self, df):
                return df[self.include_cols], df[self.target_col]

        class FakeModelCore:
            def __init__(self):
                self.model = object()
                self.r2_score = 0.9876
                self.mae = 0.1234

            def train(self, X, y, metric='r2'):
                return None

        class FakeShapValues:
            def __init__(self, values):
                self.values = values

        class FakeInsightEngine:
            def __init__(self, model, X):
                self.X = X

            def compute(self, y):
                shap_values = FakeShapValues(np.array([[0.1], [0.2], [0.3], [0.4], [0.5], [0.6], [0.7], [0.8], [0.9], [1.0]]))
                return self.X.iloc[:10], y.iloc[:10], shap_values

        class FakeSystemContext:
            @staticmethod
            def _fix_matplotlib_chinese():
                return None

        class FakeVisualStudio:
            @staticmethod
            def get_dependence_plot_base64(shap_values, X_sample, feature_name):
                return 'dependence-image'

            @staticmethod
            def get_beeswarm_base64(shap_values, X_sample):
                return 'beeswarm-image'

            @staticmethod
            def get_full_report_base64(
                shap_values,
                X_sample,
                y_sample,
                model_r2,
                model_mae,
                target_col,
                max_dependence_plots=8,
                detail_feature_names=None,
            ):
                return 'full-report-image'

        fake_tool_module = types.ModuleType('algorithm.robust_insight_tool')
        fake_tool_module.DataEngine = FakeDataEngine
        fake_tool_module.InsightEngine = FakeInsightEngine
        fake_tool_module.ModelCore = FakeModelCore
        fake_tool_module.SystemContext = FakeSystemContext
        fake_tool_module.VisualStudio = FakeVisualStudio

        real_import = builtins.__import__

        def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
          if name == 'backend.algorithm.robust_insight_tool':
              raise ModuleNotFoundError("No module named 'backend'")
          if name == 'algorithm.robust_insight_tool':
              return fake_tool_module
          return real_import(name, globals, locals, fromlist, level)

        rows = [
            {'target': float(index * 3), 'f1': float(index), 'f2': float(index % 4)}
            for index in range(1, 13)
        ]

        with patch('builtins.__import__', side_effect=fake_import):
            results = analyze_xgboost_shap(rows, 'target', {'factorNames': ['f1']})

        self.assertEqual(results['summary']['targetField'], 'target')
        self.assertEqual(results['summary']['featureCount'], 1)
        self.assertEqual(results['summary']['sampleCount'], 10)
        self.assertEqual(results['assets']['beeswarmImage'], 'beeswarm-image')
        self.assertEqual(results['assets']['fullReportImage'], 'full-report-image')
        self.assertEqual(results['dependence'][0]['feature'], 'f1')

    def test_analyze_xgboost_shap_limits_dependence_outputs_to_default_top_8(self):
        from backend.algorithms.xgboost_shap_analysis import analyze_xgboost_shap

        recorded = {
            'dependence_features': [],
            'full_report_limit': None,
            'full_report_features': None,
        }

        class FakeDataEngine:
            def __init__(self, target_col, include_cols=None, use_regex=False):
                self.target_col = target_col
                self.include_cols = include_cols or []

            def load_data(self, df):
                return df

            def get_X_y(self, df):
                return df[self.include_cols], df[self.target_col]

        class FakeModelCore:
            def __init__(self):
                self.model = object()
                self.r2_score = 0.9123
                self.mae = 0.2345

            def train(self, X, y, metric='r2'):
                return None

        class FakeShapValues:
            def __init__(self, values):
                self.values = values

        class FakeInsightEngine:
            def __init__(self, model, X):
                self.X = X

            def compute(self, y):
                feature_count = len(self.X.columns)
                rows = 12
                values = np.arange(rows * feature_count, dtype=float).reshape(rows, feature_count)
                return self.X.iloc[:rows], y.iloc[:rows], FakeShapValues(values)

        class FakeSystemContext:
            @staticmethod
            def _fix_matplotlib_chinese():
                return None

        class FakeVisualStudio:
            @staticmethod
            def get_dependence_plot_base64(shap_values, X_sample, feature_name):
                recorded['dependence_features'].append(feature_name)
                return f'dependence-image-{feature_name}'

            @staticmethod
            def get_beeswarm_base64(shap_values, X_sample):
                return 'beeswarm-image'

            @staticmethod
            def get_full_report_base64(
                shap_values,
                X_sample,
                y_sample,
                model_r2,
                model_mae,
                target_col,
                max_dependence_plots=8,
                detail_feature_names=None,
            ):
                recorded['full_report_limit'] = max_dependence_plots
                recorded['full_report_features'] = detail_feature_names
                return 'full-report-image'

        fake_tool_module = types.ModuleType('algorithm.robust_insight_tool')
        fake_tool_module.DataEngine = FakeDataEngine
        fake_tool_module.InsightEngine = FakeInsightEngine
        fake_tool_module.ModelCore = FakeModelCore
        fake_tool_module.SystemContext = FakeSystemContext
        fake_tool_module.VisualStudio = FakeVisualStudio

        real_import = builtins.__import__

        def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == 'backend.algorithm.robust_insight_tool':
                raise ModuleNotFoundError("No module named 'backend'")
            if name == 'algorithm.robust_insight_tool':
                return fake_tool_module
            return real_import(name, globals, locals, fromlist, level)

        factor_names = [f'f{index}' for index in range(1, 11)]
        rows = []
        for row_index in range(1, 15):
            row = {'target': float(row_index)}
            for feature_index, feature_name in enumerate(factor_names, start=1):
                row[feature_name] = float(row_index * feature_index)
            rows.append(row)

        with patch('builtins.__import__', side_effect=fake_import):
            results = analyze_xgboost_shap(rows, 'target', {'factorNames': factor_names})

        expected_features = ['f10', 'f9', 'f8', 'f7', 'f6', 'f5', 'f4', 'f3']
        self.assertEqual(results['summary']['featureCount'], 10)
        self.assertEqual(len(results['dependence']), 8)
        self.assertEqual(len(results['assets']['dependenceImages']), 8)
        self.assertEqual(len(recorded['dependence_features']), 8)
        self.assertEqual(recorded['dependence_features'], expected_features)
        self.assertEqual(recorded['full_report_limit'], 8)
        self.assertEqual(recorded['full_report_features'], expected_features)


if __name__ == '__main__':
    unittest.main()
