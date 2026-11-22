CREATE TABLE torch_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, game_key TEXT NOT NULL);
INSERT INTO torch_changes(game_key) SELECT game_key FROM torch_release_winners ORDER BY game_key;
CREATE TRIGGER torch_change_publish AFTER INSERT ON torch_release_history BEGIN
 INSERT INTO torch_changes(game_key) VALUES (NEW.game_key);
END;
CREATE TRIGGER torch_change_revoke AFTER INSERT ON torch_release_revocations BEGIN
 INSERT INTO torch_changes(game_key) SELECT DISTINCT game_key FROM torch_release_history WHERE profile_hash=NEW.profile_hash;
END;
