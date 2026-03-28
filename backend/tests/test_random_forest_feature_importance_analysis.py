import unittest


class RandomForestFeatureImportanceAnalysisTests(unittest.TestCase):
    def test_analyze_random_forest_feature_importance_returns_importance_and_predictions(self):
        from backend.algorithms.random_forest_feature_importance_analysis import (
            analyze_random_forest_feature_importance,
        )

        rows = []
        for index in range(1, 81):
            f1 = float(index)
            f2 = float((index % 7) * 1.5)
            f3 = float((index % 5) - 2)
            noise = float((index % 3) - 1)
            target = 5.0 * f1 + 1.2 * f2 + 0.2 * f3 + noise
            rows.append({'target': target, 'f1': f1, 'f2': f2, 'f3': f3, 'batch': 'A'})

        results = analyze_random_forest_feature_importance(
            rows,
            'target',
            {'factorNames': ['f1', 'f2', 'f3'], 'nEstimators': 200, 'maxDepth': 8},
        )

        self.assertEqual(results['summary']['targetField'], 'target')
        self.assertEqual(results['summary']['featureCount'], 3)
        self.assertGreater(results['summary']['sampleCount'], 60)
        self.assertGreater(results['summary']['r2'], 0.9)
        self.assertIn('nEstimators', results['summary'])
        self.assertIn('maxDepth', results['summary'])

        importance = results['importance']
        self.assertEqual(len(importance), 3)
        self.assertEqual(importance[0]['name'], 'f1')
        self.assertGreater(importance[0]['value'], importance[1]['value'])

        cumulative_importance = results['cumulativeImportance']
        self.assertEqual(len(cumulative_importance), 3)
        self.assertEqual(cumulative_importance[-1]['cumulativeValue'], 1.0)

        predictions = results['predictions']
        self.assertEqual(len(predictions['actual']), len(predictions['predicted']))
        self.assertGreater(len(predictions['actual']), 5)

        self.assertIn('risks', results)


if __name__ == '__main__':
    unittest.main()
