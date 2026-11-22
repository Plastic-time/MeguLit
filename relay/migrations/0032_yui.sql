CREATE TABLE yui_events (id TEXT PRIMARY KEY, stage TEXT NOT NULL, previous TEXT NOT NULL, ms INTEGER NOT NULL);
CREATE TABLE yui_issues (stage TEXT PRIMARY KEY, count INTEGER NOT NULL, previous TEXT NOT NULL, ms INTEGER NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0, issue INTEGER, lease INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER yui_count AFTER INSERT ON yui_events BEGIN
  INSERT INTO yui_issues(stage,count,previous,ms) VALUES (NEW.stage,1,NEW.previous,NEW.ms)
  ON CONFLICT(stage) DO UPDATE SET count=count+1,previous=excluded.previous,ms=excluded.ms;
END;
