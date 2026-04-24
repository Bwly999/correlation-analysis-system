CREATE TABLE IF NOT EXISTS `workflow_current` (
  `user_id` varchar(191) NOT NULL,
  `workflow_id` varchar(191) NOT NULL,
  `workflow_name` varchar(255) NOT NULL,
  `updated_at_ms` bigint NOT NULL,
  `current_workflow_json` json NOT NULL,
  PRIMARY KEY (`user_id`, `workflow_id`),
  KEY `idx_workflow_current_user_updated` (`user_id`, `updated_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workflow_versions` (
  `version_id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `workflow_id` varchar(191) NOT NULL,
  `workflow_name` varchar(255) NOT NULL,
  `created_at_ms` bigint NOT NULL,
  `workflow_updated_at_ms` bigint NOT NULL,
  `source` varchar(32) NOT NULL,
  `workflow_json` json NOT NULL,
  PRIMARY KEY (`version_id`),
  KEY `idx_workflow_versions_user_workflow_created` (`user_id`, `workflow_id`, `created_at_ms`),
  KEY `idx_workflow_versions_user_created` (`user_id`, `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `execution_history` (
  `execution_id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `workflow_id` varchar(191) NOT NULL,
  `workflow_name` varchar(255) NOT NULL,
  `start_time_ms` bigint NOT NULL,
  `duration_ms` bigint NOT NULL,
  `status` varchar(32) NOT NULL,
  `record_json` json NOT NULL,
  PRIMARY KEY (`execution_id`),
  KEY `idx_execution_history_user_start` (`user_id`, `start_time_ms`),
  KEY `idx_execution_history_user_workflow_start` (`user_id`, `workflow_id`, `start_time_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
