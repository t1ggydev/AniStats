import { prisma } from "../../utils/prisma";
import { anilistRequest } from "./anilistClient";
import crypto from "crypto";



export const FULL_ANIME_FIELDS = `
    id
    title {
      romaji
      english
    }
    format
    averageScore
    season
    seasonYear
    episodes
    updatedAt

    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }

    coverImage {
      large
    }
    genres
    tags {
      id
      name
      rank
      isAdult
    }
    relations {
      edges {
        relationType
        node {
          id
        }
      }
    }
`;
const QUERY = `query FullAnime($id: Int!) { Media(id: $id, type: ANIME) { ${FULL_ANIME_FIELDS} } }`;

type FuzzyDate = {
  year: number | null;
  month: number | null;
  day: number | null;
};

export type FullAnimeResponse = {
  Media: {
    id: number;
    title: {
      romaji: string | null;
      english: string | null;
    };
    format: string | null;
    averageScore: number | null;
    season: string | null;
    seasonYear: number | null;
    episodes: number | null;
    updatedAt: number;

    startDate: FuzzyDate | null;
    endDate: FuzzyDate | null;

    coverImage: { large: string | null };
    genres: string[];
    tags: {
      id: number;
      name: string;
      rank: number | null;
      isAdult: boolean;
    }[];
    relations: {
      edges: {
        relationType: string;
        node: { id: number };
      }[];
    };
  };
};

function hashAnime(m: FullAnimeResponse["Media"]) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        en: m.title.english,
        ro: m.title.romaji,
        cover: m.coverImage.large,
        format: m.format,
        averageScore: m.averageScore,
        season: m.season,
        seasonYear: m.seasonYear,
        episodes: m.episodes,

        startDate: m.startDate,
        endDate: m.endDate,

        genres: m.genres,
        tags: [...m.tags].sort((a,b) => a.id-b.id),
        relations: [...m.relations.edges].sort((a,b) => a.node.id-b.node.id || a.relationType.localeCompare(b.relationType)),
      })
    )
    .digest("hex");
}

export async function syncAnime(anilistId: number) {
  const { Media } = await anilistRequest<FullAnimeResponse>(QUERY, {
    id: anilistId,
  });

  return applyAnimeSnapshot(Media);
}

export function normalizeAnimeSnapshot(input: FullAnimeResponse["Media"]): FullAnimeResponse["Media"] {
  return {
    ...input,
    genres: [...new Set(input.genres)],
    tags: [...new Map(input.tags.map(tag => [tag.id, tag])).values()],
    relations: { edges: [...new Map(input.relations.edges.map(edge => [edge.node.id+':'+edge.relationType, edge])).values()] },
  };
}

export async function applyAnimeSnapshot(input: FullAnimeResponse["Media"]) {
  const Media = normalizeAnimeSnapshot(input);
  const dataHash = hashAnime(Media);

  const changed = await prisma.$transaction(async (tx) => {

  const existing = await tx.anime.findUnique({
    where: { id: Media.id },
    select: { dataHash: true },
  });

  // ✅ Skip wenn unverändert
  if (existing?.dataHash === dataHash) {
    console.log(`[AniList Sync] skip unchanged anime id=${Media.id}`);
    return false;
  }

  // -----------------------------
  // Anime
  // -----------------------------
  await tx.anime.upsert({
    where: { id: Media.id },
    update: {
      titleEn: Media.title.english,
      titleRo: Media.title.romaji,
      cover: Media.coverImage.large,
      format: Media.format,
      averageScore: Media.averageScore,
      season: Media.season,
      seasonYear: Media.seasonYear,
      episodes: Media.episodes,

      startYear: Media.startDate?.year ?? null,
      startMonth: Media.startDate?.month ?? null,
      startDay: Media.startDate?.day ?? null,

      endYear: Media.endDate?.year ?? null,
      endMonth: Media.endDate?.month ?? null,
      endDay: Media.endDate?.day ?? null,

      dataHash,
    },
    create: {
      id: Media.id,
      titleEn: Media.title.english,
      titleRo: Media.title.romaji,
      cover: Media.coverImage.large,
      format: Media.format,
      averageScore: Media.averageScore,
      season: Media.season,
      seasonYear: Media.seasonYear,
      episodes: Media.episodes,

      startYear: Media.startDate?.year ?? null,
      startMonth: Media.startDate?.month ?? null,
      startDay: Media.startDate?.day ?? null,

      endYear: Media.endDate?.year ?? null,
      endMonth: Media.endDate?.month ?? null,
      endDay: Media.endDate?.day ?? null,

      dataHash,
    },
  });

  // -----------------------------
  // Genres
  // -----------------------------
  await tx.animeGenre.deleteMany({
    where: { animeId: Media.id },
  });

  if (Media.genres.length > 0) {
    await tx.animeGenre.createMany({
      data: Media.genres.map((name) => ({
        animeId: Media.id,
        name,
      })),
    });
  }

  // -----------------------------
  // Tags
  // -----------------------------
  await tx.animeTag.deleteMany({
    where: { animeId: Media.id },
  });

  if (Media.tags.length > 0) {
    await tx.animeTag.createMany({
      data: Media.tags.map((t) => ({
        animeId: Media.id,
        tagId: t.id,
        name: t.name,
        rank: t.rank,
        isAdult: t.isAdult,
      })),
    });
  }

  // -----------------------------
  // Relations
  // -----------------------------

  // Alte Relations löschen
  await tx.animeRelation.deleteMany({
    where: { fromId: Media.id },
  });

  // Ziel-IDs sammeln
  const targetIds = [...new Set(Media.relations.edges.map((e) => e.node.id))];

  if (targetIds.length > 0) {
    // 🔹 prüfen, welche Anime bereits existieren
    const existing = await tx.anime.findMany({
      where: { id: { in: targetIds } },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((a) => a.id));

    // 🔹 nur fehlende IDs als Stub anlegen
    const missingIds = targetIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      await tx.anime.createMany({
        data: missingIds.map((id) => ({ id })),
      });
    }
  }

  // Relations schreiben
  if (Media.relations.edges.length > 0) {
    await tx.animeRelation.createMany({
      data: Media.relations.edges.map((e) => ({
        fromId: Media.id,
        toId: e.node.id,
        relationType: e.relationType,
      })),
    });
  }

  return true;
  }, { timeout: 15000 });

  // Rate delay is outside the transaction: do not hold database locks while sleeping.

  return changed;
}
