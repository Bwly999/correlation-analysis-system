CREATE TABLE IF NOT EXISTS `notebook_user_model_profiles` (
  `profile_id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `name` varchar(255) NOT NULL,
  `base_url` varchar(512) NOT NULL,
  `model` varchar(191) NOT NULL,
  `api_key` varchar(512) NOT NULL,
  `context_window` int NULL,
  `max_tokens` int NULL,
  `thinking_level` varchar(16) NULL,
  `created_at_ms` bigint NOT NULL,
  `updated_at_ms` bigint NOT NULL,
  PRIMARY KEY (`profile_id`),
  KEY `idx_nump_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
