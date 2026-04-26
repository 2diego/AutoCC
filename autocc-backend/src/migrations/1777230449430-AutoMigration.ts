import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1777230449430 implements MigrationInterface {
    name = 'AutoMigration1777230449430'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "document_notes_audit" ("id" SERIAL NOT NULL, "erpSource" character varying(10) NOT NULL, "documentKey" character varying NOT NULL, "oldObservaciones" text, "newObservaciones" text, "oldMotivoDeuda" text, "newMotivoDeuda" text, "changed_at" TIMESTAMP NOT NULL DEFAULT now(), "changed_by_user_id" integer, CONSTRAINT "PK_c63c3fa4efba31062ca95ff5783" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'operator')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'operator', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cc_current" ("id" SERIAL NOT NULL, "erpSource" character varying(10) NOT NULL, "clienteId" character varying(32) NOT NULL, "tienda" character varying(10) NOT NULL, "tipoDocumento" character varying(16) NOT NULL, "numeroDocumento" character varying(64) NOT NULL, "fechaDoc" date, "valor" numeric(16,2), "saldo" numeric(16,2), "rawRowJson" text, "observaciones" text, "motivoDeuda" text, "last_consolidation_id" integer, CONSTRAINT "PK_3c74193f6e735b257928cf1b425" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7971ac3dcc137c4050e0a6cb19" ON "cc_current" ("erpSource", "clienteId", "tienda", "tipoDocumento", "numeroDocumento") `);
        await queryRunner.query(`CREATE TABLE "cc_backup" ("id" SERIAL NOT NULL, "erpSource" character varying(10) NOT NULL, "clienteId" character varying NOT NULL, "tienda" character varying NOT NULL, "tipoDocumento" character varying NOT NULL, "numeroDocumento" character varying NOT NULL, "fechaDoc" date, "valor" numeric(16,2), "saldo" numeric(16,2), "rawRowJson" text, "observaciones" text, "motivoDeuda" text, "backup_created_at" TIMESTAMP NOT NULL DEFAULT now(), "backup_from_consolidation_id" integer, CONSTRAINT "PK_642b474293b4cd3f56a73638454" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "consolidation_errors" ("id" SERIAL NOT NULL, "sourceFile" character varying NOT NULL, "lineNumber" integer NOT NULL, "rawLine" text NOT NULL, "errorCode" character varying NOT NULL, "message" text NOT NULL, "consolidation_id" integer NOT NULL, CONSTRAINT "PK_35c4ef6383aff4087067d1e2ecf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."consolidations_erpsource_enum" AS ENUM('CEOS', 'TOTVS')`);
        await queryRunner.query(`CREATE TYPE "public"."consolidations_status_enum" AS ENUM('processing', 'ok', 'failed')`);
        await queryRunner.query(`CREATE TABLE "consolidations" ("id" SERIAL NOT NULL, "erpSource" "public"."consolidations_erpsource_enum" NOT NULL, "baseFileName" character varying NOT NULL, "erpFileName" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."consolidations_status_enum" NOT NULL DEFAULT 'processing', "baseDocsCount" integer NOT NULL DEFAULT '0', "erpDocsCount" integer NOT NULL DEFAULT '0', "addedDocsCount" integer NOT NULL DEFAULT '0', "keptDocsCount" integer NOT NULL DEFAULT '0', "errorCount" integer NOT NULL DEFAULT '0', "baseFileText" text, CONSTRAINT "PK_649f5d0fd4afe223d04f1ba43a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "document_notes_audit" ADD CONSTRAINT "FK_23210d944140ff53565a2befe9c" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cc_current" ADD CONSTRAINT "FK_69941f083c4fa04fa87c810695e" FOREIGN KEY ("last_consolidation_id") REFERENCES "consolidations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cc_backup" ADD CONSTRAINT "FK_8592364d054a0db7962e593345f" FOREIGN KEY ("backup_from_consolidation_id") REFERENCES "consolidations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "consolidation_errors" ADD CONSTRAINT "FK_0b4496e4b3e95f8fcc96c5ce78e" FOREIGN KEY ("consolidation_id") REFERENCES "consolidations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consolidation_errors" DROP CONSTRAINT "FK_0b4496e4b3e95f8fcc96c5ce78e"`);
        await queryRunner.query(`ALTER TABLE "cc_backup" DROP CONSTRAINT "FK_8592364d054a0db7962e593345f"`);
        await queryRunner.query(`ALTER TABLE "cc_current" DROP CONSTRAINT "FK_69941f083c4fa04fa87c810695e"`);
        await queryRunner.query(`ALTER TABLE "document_notes_audit" DROP CONSTRAINT "FK_23210d944140ff53565a2befe9c"`);
        await queryRunner.query(`DROP TABLE "consolidations"`);
        await queryRunner.query(`DROP TYPE "public"."consolidations_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."consolidations_erpsource_enum"`);
        await queryRunner.query(`DROP TABLE "consolidation_errors"`);
        await queryRunner.query(`DROP TABLE "cc_backup"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7971ac3dcc137c4050e0a6cb19"`);
        await queryRunner.query(`DROP TABLE "cc_current"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "document_notes_audit"`);
    }

}
