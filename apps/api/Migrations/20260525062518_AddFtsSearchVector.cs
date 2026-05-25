using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebCrawlerApi.Migrations
{
    /// <inheritdoc />
    public partial class AddFtsSearchVector : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Add tsvector column to data_entries (HasColumnType from ModelBuilder is metadata-only;
            //    real DDL needs to come from here — Npgsql 8.0 HasGeneratedTsVectorColumn is broken with JSONB)
            migrationBuilder.Sql(
                "ALTER TABLE data_entries ADD COLUMN search_vector tsvector;");

            // 2. GIN index for fast @@ tsquery matching
            migrationBuilder.Sql(
                "CREATE INDEX ix_data_entries_search_vector ON data_entries USING GIN (search_vector);");

            // 3. search_configs table — per-source list of JSONPath expressions for FTS extraction
            migrationBuilder.Sql(@"
                CREATE TABLE search_configs (
                    source_id UUID PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
                    json_paths TEXT[] NOT NULL DEFAULT '{}'
                );");

            // 4. Seed search_configs — one row per source, keyed by parser_key
            //    (parser_key values verified against db/seed.sql lines 99-119)
            migrationBuilder.Sql(@"
                INSERT INTO search_configs (source_id, json_paths)
                SELECT id, ARRAY['$.home_team','$.away_team','$.competition','$.status','$.team']
                FROM sources WHERE parser_key = 'football'
                ON CONFLICT (source_id) DO NOTHING;

                INSERT INTO search_configs (source_id, json_paths)
                SELECT id, ARRAY['$.event_name']
                FROM sources WHERE parser_key = 'genshin'
                ON CONFLICT (source_id) DO NOTHING;

                INSERT INTO search_configs (source_id, json_paths)
                SELECT id, ARRAY['$.champion','$.role','$.tier','$.patch']
                FROM sources WHERE parser_key = 'lol'
                ON CONFLICT (source_id) DO NOTHING;

                INSERT INTO search_configs (source_id, json_paths)
                SELECT id, ARRAY['$.title','$.status']
                FROM sources WHERE parser_key = 'anilist'
                ON CONFLICT (source_id) DO NOTHING;

                INSERT INTO search_configs (source_id, json_paths)
                SELECT id, ARRAY['$.manga_title','$.title']
                FROM sources WHERE parser_key = 'mangadex'
                ON CONFLICT (source_id) DO NOTHING;
            ");

            // 5. PL/pgSQL trigger function that reads search_configs.json_paths for the row's
            //    source_id, extracts JSONB values via jsonb_path_query, concatenates,
            //    and writes to_tsvector('english', ...) into NEW.search_vector.
            migrationBuilder.Sql(@"
                CREATE OR REPLACE FUNCTION data_entries_search_vector_update()
                RETURNS TRIGGER AS $func$
                DECLARE
                    v_paths TEXT[];
                    v_path  TEXT;
                    v_text  TEXT := '';
                    v_extracted TEXT;
                BEGIN
                    SELECT json_paths
                    INTO v_paths
                    FROM search_configs
                    WHERE source_id = NEW.source_id;

                    IF v_paths IS NOT NULL THEN
                        FOREACH v_path IN ARRAY v_paths LOOP
                            BEGIN
                                SELECT string_agg(elem #>> '{}', ' ')
                                INTO v_extracted
                                FROM jsonb_path_query(NEW.payload, v_path::jsonpath) AS elem;
                            EXCEPTION WHEN OTHERS THEN
                                v_extracted := NULL;
                            END;

                            IF v_extracted IS NOT NULL AND v_extracted <> '' THEN
                                v_text := v_text || ' ' || v_extracted;
                            END IF;
                        END LOOP;
                    END IF;

                    IF trim(v_text) = '' THEN
                        v_text := COALESCE(NEW.entry_key, '');
                    END IF;

                    NEW.search_vector := to_tsvector('english', trim(v_text));
                    RETURN NEW;
                END;
                $func$ LANGUAGE plpgsql;
            ");

            // 6. Trigger: fire BEFORE INSERT OR UPDATE on data_entries
            migrationBuilder.Sql(@"
                CREATE TRIGGER data_entries_search_vector_trigger
                    BEFORE INSERT OR UPDATE ON data_entries
                    FOR EACH ROW EXECUTE FUNCTION data_entries_search_vector_update();
            ");

            // 7. Documentation: pre-existing rows have NULL search_vector. They will not match
            //    FTS queries until they are UPDATEd (which fires the trigger). For a personal
            //    project running on GCP e2-medium, we accept that historical entries are
            //    unsearchable rather than running an expensive bulk UPDATE.
            //    To backfill manually after deploy:
            //        UPDATE data_entries SET payload = payload;
            //    (this triggers BEFORE UPDATE on every row)
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS data_entries_search_vector_trigger ON data_entries;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS data_entries_search_vector_update();");
            migrationBuilder.Sql("DROP TABLE IF EXISTS search_configs;");
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_data_entries_search_vector;");
            migrationBuilder.Sql("ALTER TABLE data_entries DROP COLUMN IF EXISTS search_vector;");
        }
    }
}
