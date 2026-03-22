import unittest


@unittest.skip('工作流 AI 默认模型配置已迁移到 TypeScript 后端服务')
class WorkflowAiProfileTests(unittest.TestCase):
    def test_default_profile_uses_zhipu_glm_4_7(self):
        pass


if __name__ == '__main__':
    unittest.main()
