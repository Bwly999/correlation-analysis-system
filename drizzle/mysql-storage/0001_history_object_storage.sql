ALTER TABLE `execution_history`
  ADD COLUMN `record_object_key` varchar(512) NULL AFTER `status`,
  MODIFY COLUMN `record_json` longtext NULL;
