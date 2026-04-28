from pathlib import Path
import unittest


class PythonRequirementsTests(unittest.TestCase):
    def test_requirements_pin_xgboost_and_shap_compatible_versions(self):
        requirements_path = Path(__file__).resolve().parents[2] / 'requirements.txt'
        self.assertTrue(requirements_path.exists(), '项目根目录需要提供标准 requirements.txt')

        lines = [
            line.strip()
            for line in requirements_path.read_text(encoding='utf-8').splitlines()
            if line.strip() and not line.strip().startswith('#')
        ]

        self.assertIn('xgboost==3.0.5', lines)
        self.assertIn('shap==0.49.1', lines)


if __name__ == '__main__':
    unittest.main()
