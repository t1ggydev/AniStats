-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Anime" (
    "id" INTEGER NOT NULL,
    "titleEn" TEXT,
    "titleRo" TEXT,
    "cover" TEXT,
    "format" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dataHash" TEXT,
    "averageScore" INTEGER,
    "season" TEXT,
    "seasonYear" INTEGER,
    "episodes" INTEGER,
    "startYear" INTEGER,
    "startMonth" INTEGER,
    "startDay" INTEGER,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "endDay" INTEGER,

    CONSTRAINT "Anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeGenre" (
    "id" SERIAL NOT NULL,
    "animeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AnimeGenre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeTag" (
    "id" SERIAL NOT NULL,
    "animeId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER,
    "isAdult" BOOLEAN NOT NULL,

    CONSTRAINT "AnimeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeRelation" (
    "id" SERIAL NOT NULL,
    "fromId" INTEGER NOT NULL,
    "toId" INTEGER NOT NULL,
    "relationType" TEXT NOT NULL,

    CONSTRAINT "AnimeRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Genre" (
    "name" TEXT NOT NULL,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER,
    "isAdult" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Anime_format_idx" ON "Anime"("format");

-- CreateIndex
CREATE INDEX "Anime_startYear_idx" ON "Anime"("startYear");

-- CreateIndex
CREATE INDEX "Anime_season_idx" ON "Anime"("season");

-- CreateIndex
CREATE INDEX "Anime_averageScore_idx" ON "Anime"("averageScore");

-- CreateIndex
CREATE INDEX "Anime_season_startYear_idx" ON "Anime"("season", "startYear");

-- CreateIndex
CREATE UNIQUE INDEX "AnimeGenre_animeId_name_key" ON "AnimeGenre"("animeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AnimeTag_animeId_tagId_key" ON "AnimeTag"("animeId", "tagId");

-- CreateIndex
CREATE INDEX "AnimeRelation_toId_idx" ON "AnimeRelation"("toId");

-- CreateIndex
CREATE INDEX "AnimeRelation_relationType_idx" ON "AnimeRelation"("relationType");

-- CreateIndex
CREATE INDEX "AnimeRelation_relationType_fromId_toId_idx" ON "AnimeRelation"("relationType", "fromId", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimeRelation_fromId_toId_relationType_key" ON "AnimeRelation"("fromId", "toId", "relationType");

-- CreateIndex
CREATE INDEX "Tag_name_idx" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Tag_category_idx" ON "Tag"("category");

-- AddForeignKey
ALTER TABLE "AnimeGenre" ADD CONSTRAINT "AnimeGenre_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeTag" ADD CONSTRAINT "AnimeTag_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeRelation" ADD CONSTRAINT "AnimeRelation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Anime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeRelation" ADD CONSTRAINT "AnimeRelation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Anime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
