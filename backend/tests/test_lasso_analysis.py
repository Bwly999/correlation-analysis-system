import unittest

import pandas as pd


class LassoAnalysisTests(unittest.TestCase):
    def test_prepare_regression_dataset_only_keeps_numeric_features(self):
        from backend.algorithms.common import prepare_regression_dataset

        source = pd.DataFrame(
            [
                {'target': 10, 'f1': 1.0, 'f2': 5.0, 'category': 'A'},
                {'target': 12, 'f1': 2.0, 'f2': None, 'category': 'B'},
                {'target': 'bad', 'f1': 3.0, 'f2': 7.0, 'category': 'C'},
            ]
        )

        prepared = prepare_regression_dataset(source, target_col='target')

        self.assertEqual(prepared.feature_names, ['f1', 'f2'])
        self.assertEqual(prepared.sample_count, 2)
        self.assertFalse(prepared.features.isnull().any().any())

    def test_analyze_lasso_returns_real_coefficients_and_path(self):
        from backend.algorithms.lasso_analysis import analyze_lasso

        rows = []
        for index in range(1, 61):
            f1 = float(index)
            f2 = float(index % 7)
            noise = float((index % 5) - 2)
            target = 4.0 * f1 + 0.05 * f2 + noise
            rows.append({'target': target, 'f1': f1, 'f2': f2, 'category': '批次A'})

        results = analyze_lasso(rows, 'target', {})

        self.assertEqual(results['summary']['targetField'], 'target')
        self.assertEqual(results['summary']['featureCount'], 2)
        self.assertGreater(results['summary']['sampleCount'], 40)
        self.assertGreater(results['summary']['r2'], 0.95)
        self.assertIn('alpha', results['summary'])

        coefficients = results['coefficients']
        self.assertGreaterEqual(len(coefficients), 2)
        self.assertEqual(coefficients[0]['name'], 'f1')
        self.assertTrue(coefficients[0]['selected'])
        self.assertGreater(abs(coefficients[0]['coefficient']), abs(coefficients[1]['coefficient']))

        path = results['path']
        self.assertGreater(len(path['alphas']), 2)
        self.assertEqual([item['feature'] for item in path['series']], ['f1', 'f2'])
        self.assertEqual(len(path['series'][0]['coefficients']), len(path['alphas']))


if __name__ == '__main__':
    unittest.main()
