-- Preserve aliases independently of signatures. The shuffled pool gives each
-- aligned block of 24 numbers one of each name, including founder #0.
CREATE TABLE torch_alias_pool (slot INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
INSERT INTO torch_alias_pool(slot,name) VALUES
 (0,'ユージオ'),(1,'ダクネス'),(2,'アスナ'),(3,'バニル'),(4,'セルカ'),(5,'クレア'),
 (6,'キリト'),(7,'ゆんゆん'),(8,'ロニエ・アラベル'),(9,'ミツルギ'),(10,'シノン'),(11,'アクア'),
 (12,'アリス'),(13,'ルナ'),(14,'エルドリエ'),(15,'レイン'),(16,'リーファ'),(17,'アイリス'),
 (18,'ティーゼ・シュトリーネン'),(19,'ウィズ'),(20,'シリカ'),(21,'クリス'),(22,'リズベット'),(23,'カズマ');

ALTER TABLE torch_credits ADD COLUMN alias TEXT;
UPDATE torch_credits SET alias=(SELECT name FROM torch_alias_pool WHERE slot=(torch_credits.torch_no%24+7*(torch_credits.torch_no/24))%24);

-- The trigger also covers inserts from a worker rolled back to the older code.
CREATE TRIGGER torch_credit_assign_alias AFTER INSERT ON torch_credits
WHEN NEW.alias IS NULL
BEGIN
  UPDATE torch_credits SET alias=(SELECT name FROM torch_alias_pool WHERE slot=(NEW.torch_no%24+7*(NEW.torch_no/24))%24)
  WHERE torch_no=NEW.torch_no;
END;

CREATE INDEX torch_credits_anonymous_alias ON torch_credits(alias,torch_no) WHERE name IS NULL;
