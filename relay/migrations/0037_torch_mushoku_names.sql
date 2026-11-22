-- Recast three historical automatic aliases whose characters also have real-name entries.
-- Keep receipt numbers, work links and personally chosen names.
CREATE TABLE mushoku_aliases(slot INTEGER PRIMARY KEY, old_label TEXT, new_label TEXT);
INSERT INTO mushoku_aliases VALUES
 (10,'Sinon','ルーデウス・グレイラット'),
 (16,'Leafa','ロキシー・ミグルディア'),
 (20,'Silica','シルフィエット');
UPDATE torch_alias_pool SET name=m.new_label FROM mushoku_aliases m
 WHERE torch_alias_pool.slot=m.slot AND torch_alias_pool.name=m.old_label;
UPDATE torch_roster_names SET label=m.new_label,name_key=m.new_label FROM mushoku_aliases m
 WHERE owner LIKE 'legacy:%' AND automatic=1 AND label=m.old_label
 AND NOT EXISTS(SELECT 1 FROM torch_roster_names n WHERE n.name_key=m.new_label);
UPDATE torch_carvings SET alias=n.label,name_key=n.name_key FROM torch_roster_names n
 WHERE torch_carvings.owner=n.owner AND n.automatic=1 AND torch_carvings.name IS NULL
 AND n.label IN (SELECT new_label FROM mushoku_aliases);
INSERT INTO torch_alias_pool(slot,name) VALUES (24,'エリス・ボレアス・グレイラット'),(25,'七星静香');
DROP TABLE mushoku_aliases;