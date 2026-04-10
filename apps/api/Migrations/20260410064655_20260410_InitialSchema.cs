using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebCrawlerApi.Migrations
{
    /// <inheritdoc />
    public partial class _20260410_InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "sources",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    name = table.Column<string>(type: "text", nullable: false),
                    display_name = table.Column<string>(type: "text", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    crawler_type = table.Column<string>(type: "text", nullable: false, defaultValue: "cheerio"),
                    crawl_interval = table.Column<int>(type: "integer", nullable: false, defaultValue: 3600),
                    priority = table.Column<int>(type: "integer", nullable: false, defaultValue: 5),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    last_crawled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    parser_key = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sources", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "alert_rules",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    source_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    condition = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    message_tpl = table.Column<string>(type: "text", nullable: false),
                    channel = table.Column<string>(type: "text", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_alert_rules", x => x.id);
                    table.ForeignKey(
                        name: "fk_alert_rules_sources_source_id",
                        column: x => x.source_id,
                        principalTable: "sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crawl_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    source_id = table.Column<Guid>(type: "uuid", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "pending"),
                    priority = table.Column<int>(type: "integer", nullable: false, defaultValue: 5),
                    content_hash = table.Column<string>(type: "text", nullable: true),
                    attempt_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    error_message = table.Column<string>(type: "text", nullable: true),
                    scheduled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_crawl_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_crawl_jobs_sources_source_id",
                        column: x => x.source_id,
                        principalTable: "sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "data_entries",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    source_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: true),
                    category = table.Column<string>(type: "text", nullable: false),
                    entry_key = table.Column<string>(type: "text", nullable: true),
                    payload = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    crawled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_entries", x => x.id);
                    table.ForeignKey(
                        name: "fk_data_entries_crawl_jobs_job_id",
                        column: x => x.job_id,
                        principalTable: "crawl_jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_data_entries_sources_source_id",
                        column: x => x.source_id,
                        principalTable: "sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notification_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    alert_rule_id = table.Column<Guid>(type: "uuid", nullable: false),
                    data_entry_id = table.Column<Guid>(type: "uuid", nullable: true),
                    channel = table.Column<string>(type: "text", nullable: false),
                    message = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "sent"),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_logs", x => x.id);
                    table.ForeignKey(
                        name: "fk_notification_logs_alert_rules_alert_rule_id",
                        column: x => x.alert_rule_id,
                        principalTable: "alert_rules",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_notification_logs_data_entries_data_entry_id",
                        column: x => x.data_entry_id,
                        principalTable: "data_entries",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_alert_rules_source_id",
                table: "alert_rules",
                column: "source_id");

            migrationBuilder.CreateIndex(
                name: "ix_crawl_jobs_source_id",
                table: "crawl_jobs",
                column: "source_id");

            migrationBuilder.CreateIndex(
                name: "ix_crawl_jobs_status",
                table: "crawl_jobs",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_crawl_jobs_url_content_hash",
                table: "crawl_jobs",
                columns: new[] { "url", "content_hash" });

            migrationBuilder.CreateIndex(
                name: "ix_data_entries_category",
                table: "data_entries",
                column: "category");

            migrationBuilder.CreateIndex(
                name: "ix_data_entries_crawled_at",
                table: "data_entries",
                column: "crawled_at",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "ix_data_entries_job_id",
                table: "data_entries",
                column: "job_id");

            migrationBuilder.CreateIndex(
                name: "ix_data_entries_payload",
                table: "data_entries",
                column: "payload")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_data_entries_source_id",
                table: "data_entries",
                column: "source_id");

            migrationBuilder.CreateIndex(
                name: "ix_data_entries_source_id_entry_key",
                table: "data_entries",
                columns: new[] { "source_id", "entry_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notification_logs_alert_rule_id",
                table: "notification_logs",
                column: "alert_rule_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_logs_data_entry_id",
                table: "notification_logs",
                column: "data_entry_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_logs_sent_at",
                table: "notification_logs",
                column: "sent_at",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "ix_sources_category",
                table: "sources",
                column: "category");

            migrationBuilder.CreateIndex(
                name: "ix_sources_is_active",
                table: "sources",
                column: "is_active",
                filter: "is_active = true");

            migrationBuilder.CreateIndex(
                name: "ix_sources_name",
                table: "sources",
                column: "name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_logs");

            migrationBuilder.DropTable(
                name: "alert_rules");

            migrationBuilder.DropTable(
                name: "data_entries");

            migrationBuilder.DropTable(
                name: "crawl_jobs");

            migrationBuilder.DropTable(
                name: "sources");
        }
    }
}
