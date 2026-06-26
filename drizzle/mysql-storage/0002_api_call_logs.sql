CREATE TABLE IF NOT EXISTS `api_call_logs` (
  `request_id` varchar(191) NOT NULL,
  `user_id` varchar(191) NULL,
  `method` varchar(16) NOT NULL,
  `route` varchar(255) NOT NULL,
  `full_path` varchar(2048) NOT NULL,
  `params_json` json NULL,
  `status` varchar(32) NOT NULL,
  `status_code` int NULL,
  `duration_ms` bigint NULL,
  `start_time_ms` bigint NOT NULL,
  `client_ip` varchar(64) NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_acl_user_start` (`user_id`, `start_time_ms`),
  KEY `idx_acl_route_start` (`route`, `start_time_ms`),
  KEY `idx_acl_status_code_start` (`status_code`, `start_time_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
