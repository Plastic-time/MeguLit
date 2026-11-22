-- Keep the original credit numbers, explicit signatures, uploads and counters.
DROP TRIGGER torch_credit_assign_alias;
CREATE TABLE torch_roster_names(
 name_key TEXT PRIMARY KEY, label TEXT NOT NULL, owner TEXT NOT NULL, automatic INTEGER NOT NULL
);
CREATE UNIQUE INDEX torch_roster_one_alias ON torch_roster_names(owner) WHERE automatic=1;
CREATE INDEX torch_roster_owner_label ON torch_roster_names(owner,label);
CREATE TABLE torch_carvings(
 torch_no INTEGER PRIMARY KEY, owner TEXT NOT NULL, work TEXT NOT NULL, game_key TEXT NOT NULL,
 at INTEGER NOT NULL, name TEXT, alias TEXT, name_key TEXT, UNIQUE(owner,work)
);
CREATE INDEX torch_carvings_find ON torch_carvings(name_key,torch_no);
CREATE INDEX torch_carvings_month ON torch_carvings(at,torch_no) WHERE name_key IS NOT NULL;
CREATE TABLE torch_roster_links(torch_no INTEGER PRIMARY KEY, carving_no INTEGER NOT NULL);
CREATE TABLE torch_roster_months(month TEXT PRIMARY KEY,n INTEGER NOT NULL);
CREATE TRIGGER torch_roster_added AFTER INSERT ON torch_carvings WHEN NEW.name_key IS NOT NULL BEGIN
 INSERT INTO torch_roster_months VALUES(strftime('%Y-%m',NEW.at,'unixepoch'),1)
 ON CONFLICT(month) DO UPDATE SET n=n+1;
END;
CREATE TRIGGER torch_roster_shown AFTER UPDATE OF name_key ON torch_carvings
WHEN OLD.name_key IS NULL AND NEW.name_key IS NOT NULL BEGIN
 INSERT INTO torch_roster_months VALUES(strftime('%Y-%m',NEW.at,'unixepoch'),1)
 ON CONFLICT(month) DO UPDATE SET n=n+1;
END;
CREATE TRIGGER torch_roster_hidden AFTER UPDATE OF name_key ON torch_carvings
WHEN OLD.name_key IS NOT NULL AND NEW.name_key IS NULL BEGIN
 UPDATE torch_roster_months SET n=n-1 WHERE month=strftime('%Y-%m',OLD.at,'unixepoch');
END;
-- Reserve one spelling globally. Prefer explicit names, then the oldest credit.
-- Each retained historical number has its own reservation, with no identity inference.
WITH labels AS (
 SELECT c.*,coalesce(n.name_key,lower(replace(coalesce(c.name,c.alias),' ',''))) AS k
 FROM torch_credits c LEFT JOIN torch_names n ON n.torch_no=c.torch_no AND c.name IS NOT NULL
), ranked AS (
 SELECT *,row_number() OVER(PARTITION BY k ORDER BY name IS NULL,torch_no) AS pos FROM labels WHERE k<>''
)
INSERT INTO torch_carvings(torch_no,owner,work,game_key,at,name,alias,name_key)
 SELECT torch_no,'legacy:'||torch_no,'',game_key,at,name,CASE WHEN name IS NULL THEN alias END,k FROM ranked WHERE pos=1;
INSERT INTO torch_roster_names SELECT name_key,coalesce(name,alias),owner,name IS NULL FROM torch_carvings;
INSERT INTO torch_roster_links SELECT torch_no,torch_no FROM torch_carvings;
