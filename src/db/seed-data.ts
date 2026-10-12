/**
 * Seed knowledge base.
 *
 * Provenance: every claim below was checked on 2026-10-12 against search-engine excerpts
 * of the cited pages (the full pages could not be fetched from the build environment).
 * Excerpts are quoted as returned by the search tool. Because no primary source was read
 * in full, nothing here is marked "verified": entries are "limited_evidence" or, where the
 * cited sources disagree, "conflicting". Two entries with no source at all are seeded as
 * unpublished AI drafts so the research agent and reviewers can pick them up.
 */

export const SEED_ACCESSED_AT = "2026-10-12T12:00:00Z";
export const SEED_RETRIEVAL = "search-engine excerpt (full page not retrieved)";

export type SeedSource = {
  key: string;
  url: string;
  title: string;
  publisher: string;
  reliability: "primary" | "secondary" | "community" | "unknown";
  notes?: string;
};

export const seedSources: SeedSource[] = [
  {
    key: "wiki_terms",
    url: "https://en.wikipedia.org/wiki/Trampolining_terms",
    title: "Trampolining terms",
    publisher: "Wikipedia",
    reliability: "secondary",
    notes: "Community-edited encyclopedia glossary.",
  },
  {
    key: "wiki_tramp",
    url: "https://en.wikipedia.org/wiki/Trampolining",
    title: "Trampolining",
    publisher: "Wikipedia",
    reliability: "secondary",
  },
  {
    key: "bren_gloss",
    url: "https://brentwood-trampoline.org/about-trampolining/glossary-of-trampolining-terms/",
    title: "Glossary of Terms",
    publisher: "Brentwood Trampoline Club",
    reliability: "community",
    notes: "Club glossary based on UK coaching material.",
  },
  {
    key: "bren_basic",
    url: "https://brentwood-trampoline.org/about-trampolining/basic-skills/",
    title: "Basic skills",
    publisher: "Brentwood Trampoline Club",
    reliability: "community",
  },
  {
    key: "bren_routines",
    url: "https://brentwood-trampoline.org/about-trampolining/routines/",
    title: "Routines",
    publisher: "Brentwood Trampoline Club",
    reliability: "community",
  },
  {
    key: "subath",
    url: "https://www.thesubath.com/pageassets/trampolining/training/Trampoline-Glossary.pdf",
    title: "Trampoline Glossary",
    publisher: "University of Bath Students' Union Trampoline Club",
    reliability: "community",
  },
  {
    key: "purley",
    url: "https://twizzlers.org/trampoline-terminology/",
    title: "Trampoline Terminology",
    publisher: "Purley Gymnastics & Trampoline Club",
    reliability: "community",
  },
  {
    key: "nbc_gloss",
    url: "https://www.nbcolympics.com/news/trampoline-101-olympic-terminology-and-glossary",
    title: "Olympic Trampoline terms: Glossary of all the terminology you need to know",
    publisher: "NBC Olympics",
    reliability: "secondary",
  },
  {
    key: "fig_cop",
    url: "https://www.gymnastics.sport/publicdir/rules/files/en_1.1%20-%20TRA%20CoP%202025-2028.pdf",
    title: "Code of Points 2025-2028 — Trampoline Gymnastics",
    publisher: "Fédération Internationale de Gymnastique (FIG)",
    reliability: "primary",
    notes: "Official rules document. Only search excerpts were reviewed; a reviewer should check the full PDF before upgrading claims to verified.",
  },
  {
    key: "fig_news_dd",
    url: "https://www.gymnastics.sport/site/news/displaynews.php?idNews=2875",
    title: "How do judges calculate difficulty scores in Trampoline?",
    publisher: "World Gymnastics (FIG)",
    reliability: "primary",
  },
  {
    key: "usag_dd",
    url: "https://static.usagym.org/PDFs/Forms/T&T/DD_TR.pdf",
    title: "Trampoline Difficulty chart",
    publisher: "USA Gymnastics",
    reliability: "secondary",
    notes: "Difficulty values change between Code cycles; use only for notation examples.",
  },
  {
    key: "wightflyers",
    url: "https://wightflyers.com/terminology.html",
    title: "Terminology used at Wight Flyers Trampoline and Gymnastics Club",
    publisher: "Wight Flyers Trampoline and Gymnastics Club",
    reliability: "community",
  },
  {
    key: "twofoot",
    url: "https://www.twofoothigher.co.uk/glossary/",
    title: "Glossary",
    publisher: "Two Foot Higher Trampoline and DMT Club",
    reliability: "community",
  },
  {
    key: "nightflyers",
    url: "https://nightflyers.co.uk/wp/trampolining/glossary/",
    title: "Glossary",
    publisher: "Nightflyers Trampoline Club",
    reliability: "community",
  },
];

export const seedCategories = [
  { slug: "shapes-and-jumps", name: "Shapes & jumps", description: "Body shapes and the straight-bounce jumps that show them.", sortOrder: 1 },
  { slug: "landings", name: "Landings", description: "Seat, front and back landings (historically called “drops”) and linking skills.", sortOrder: 2 },
  { slug: "single-somersaults", name: "Single somersaults", description: "Skills with up to one and a quarter somersaults, with or without twist.", sortOrder: 3 },
  { slug: "multiple-somersaults", name: "Multiple somersaults", description: "Double and triple somersaults and how their twists are distributed.", sortOrder: 4 },
  { slug: "terminology", name: "Terminology & notation", description: "Words and notation used to describe skills.", sortOrder: 5 },
  { slug: "competition", name: "Competition & scoring", description: "How routines are structured and judged.", sortOrder: 6 },
];

type Cite = { source: string; excerpt: string; stance?: "supports" | "contradicts" | "context" };
type SeedClaim = { statement: string; status: "supported" | "limited" | "disputed" | "unsupported"; cites: Cite[] };

export type SeedEntry = {
  name: string;
  category: string;
  kind?: "skill" | "term" | "rule";
  summary: string;
  body?: string;
  aliases?: string[];
  tags?: string[];
  figNotation?: string;
  quarterRotations?: number;
  halfTwists?: number;
  position?: "tuck" | "pike" | "straight" | "straddle" | "any" | "none";
  evidence: "limited_evidence" | "conflicting" | "ai_draft";
  publish: boolean;
  claims: SeedClaim[];
};

export const seedEntries: SeedEntry[] = [
  // ---------------------------------------------------------------- shapes
  {
    name: "Tuck",
    category: "shapes-and-jumps",
    kind: "term",
    summary: "A body shape with the knees bent and drawn into the chest.",
    aliases: ["Tucked", "Tuck position"],
    tags: ["shape", "basics"],
    position: "tuck",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "Tuck is a position in which the knees are bent and drawn into the chest.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "a position where the knees are bent and drawn into the chest" }],
      },
    ],
  },
  {
    name: "Pike",
    category: "shapes-and-jumps",
    kind: "term",
    summary: "A body shape bent forward at the hips with the legs kept straight.",
    aliases: ["Piked", "Pike position"],
    tags: ["shape", "basics"],
    position: "pike",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "Pike is a position in which the body is bent forward at the hips to 90° or more while the legs are kept straight.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "a position where the body is bent forward at the hips to 90° or more while the legs are kept straight" }],
      },
    ],
  },
  {
    name: "Straddle",
    category: "shapes-and-jumps",
    kind: "term",
    summary: "A body shape with straight legs split wide apart.",
    aliases: ["Straddled", "Straddle position"],
    tags: ["shape", "basics"],
    position: "straddle",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "In a straddle the legs are kept straight and split at least shoulder width apart.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "the legs are split at least shoulder width apart" }],
      },
    ],
  },
  {
    name: "Tuck jump",
    category: "shapes-and-jumps",
    summary: "A straight bounce that shows the tuck shape, with no somersault rotation or twist.",
    aliases: ["Tucked jump"],
    tags: ["jump", "basics"],
    quarterRotations: 0,
    halfTwists: 0,
    position: "tuck",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A tuck jump is a move showing the tuck shape alone, without rotation or twist.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "tucked jump · move showing the \"tuck\" shape alone" }],
      },
    ],
  },
  {
    name: "Pike jump",
    category: "shapes-and-jumps",
    summary: "A straight bounce that shows the pike shape, with no somersault rotation or twist.",
    aliases: ["Piked jump"],
    tags: ["jump", "basics"],
    quarterRotations: 0,
    halfTwists: 0,
    position: "pike",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "Tuck, pike and straddle jumps each show their shape alone, with no rotation or twist.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "A tuck jump, pike jump, or straddle jump shows the shape alone with no rotation or twist" }],
      },
    ],
  },
  {
    name: "Straddle jump",
    category: "shapes-and-jumps",
    summary: "A straight bounce that shows the straddle shape, with no somersault rotation or twist.",
    aliases: ["Straddled jump", "Straddle pike jump"],
    tags: ["jump", "basics"],
    quarterRotations: 0,
    halfTwists: 0,
    position: "straddle",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "Tuck, pike and straddle jumps each show their shape alone, with no rotation or twist.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "A tuck jump, pike jump, or straddle jump shows the shape alone with no rotation or twist" }],
      },
    ],
  },
  // ---------------------------------------------------------------- landings
  {
    name: "Landing (formerly “drop”)",
    category: "terminology",
    kind: "term",
    summary: "Seat, front and back skills are now usually called landings; the older word “drop” has been discouraged.",
    aliases: ["Drop", "Drops"],
    tags: ["terminology", "landing"],
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "The various landings used to be known as “drops”, and use of the word “drop” has been actively discouraged for several years.",
        status: "limited",
        cites: [
          {
            source: "bren_basic",
            excerpt: "These various 'Landings' always used to be known as 'Drops'. The use of the word Drop has been actively discouraged now for several years.",
          },
        ],
      },
    ],
  },
  {
    name: "Seat landing",
    category: "landings",
    summary: "A landing on the seat, reached from the feet with minimal backward rotation.",
    aliases: ["Seat drop", "Sit drop"],
    tags: ["landing", "basics"],
    quarterRotations: 0,
    halfTwists: 0,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A seat landing starts on the feet and rotates backwards a minimal amount before landing on the seat.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "a move starting on feet and rotating backwards a minimal amount" }],
      },
    ],
  },
  {
    name: "Front landing",
    category: "landings",
    summary: "A landing on the front, reached from the feet with a quarter forward somersault rotation.",
    aliases: ["Front drop"],
    tags: ["landing", "basics"],
    quarterRotations: 1,
    halfTwists: 0,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A front landing starts on the feet and rotates forwards a quarter of a somersault to land on the front.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "a move starting on feet and rotating forwards ¼ of a somersault and landing on front is the front drop" }],
      },
      {
        statement: "A front landing is performed accurately when the hips land approximately where the feet were at take-off.",
        status: "limited",
        cites: [
          {
            source: "bren_basic",
            excerpt: "The move is performed accurately when your hips are landing approximately in the same position your feet were at take-off.",
          },
        ],
      },
      {
        statement: "In a routine a front landing always needs a following skill, usually a return to feet.",
        status: "limited",
        cites: [{ source: "bren_routines", excerpt: "a Front Drop will always require a skill to follow, usually \"To Feet\"." }],
      },
    ],
  },
  {
    name: "Back landing",
    category: "landings",
    summary: "A landing on the back, reached from the feet with a quarter somersault rotation.",
    aliases: ["Back drop"],
    tags: ["landing", "basics"],
    quarterRotations: 1,
    halfTwists: 0,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A back landing turns through a quarter somersault and lands on the back.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "Search summary: a back drop turns a quarter somersault and lands on the back." }],
      },
    ],
  },
  {
    name: "Swivel hips",
    category: "landings",
    summary: "A half twist from a seat landing to a second seat landing; in routine counting it implies three skills.",
    aliases: ["Swivel hip", "Seat half twist to seat"],
    tags: ["landing", "twist"],
    quarterRotations: 0,
    halfTwists: 1,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "Swivel hips is a half twist made from a seat landing that lands back on the seat.",
        status: "limited",
        cites: [{ source: "bren_basic", excerpt: "Search summary: the glossary defines it as a half twist made from the seat that lands back on the seat." }],
      },
      {
        statement: "When written in a routine, “swivel hips” implies three skills: seat landing, half twist to seat landing, and return to feet.",
        status: "limited",
        cites: [
          { source: "bren_routines", excerpt: "Seat landing; Half Twist to Seat Drop; Return to feet." },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- single somersaults
  {
    name: "Barani",
    category: "single-somersaults",
    summary: "A single front somersault with a half twist.",
    aliases: ["Front half", "Front somersault with half twist", "Baranni", "Barany"],
    tags: ["somersault", "twist", "forward"],
    figNotation: "41",
    quarterRotations: 4,
    halfTwists: 1,
    position: "any",
    evidence: "limited_evidence",
    publish: true,
    body: "Notation 41 follows the FIG pattern: four quarter rotations (one somersault) and one half twist.",
    claims: [
      {
        statement: "A barani is a front somersault with a half twist before landing, also known as a front-half.",
        status: "limited",
        cites: [
          { source: "wiki_terms", excerpt: "Barani – A front somersault with a half twist before landing; also known as a front-half." },
          { source: "nbc_gloss", excerpt: "Barani: A single forward somersault with a half twist." },
        ],
      },
      {
        statement: "In FIG notation a straight front somersault with a half twist is written 41/.",
        status: "limited",
        cites: [{ source: "wiki_tramp", excerpt: "41/ as a straight front somersault with a half twist" }],
      },
    ],
  },
  {
    name: "Rudolph",
    category: "single-somersaults",
    summary: "A single straight front somersault with one and a half twists.",
    aliases: ["Rudy", "Rudi", "Rudolf", "Front one and a half twist"],
    tags: ["somersault", "twist", "forward"],
    quarterRotations: 4,
    halfTwists: 3,
    position: "straight",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A Rudolph (or Rudy) is a single straight front somersault with one and a half twists.",
        status: "limited",
        cites: [{ source: "wiki_terms", excerpt: "Rudolph (or Rudy) – A single straight front somersault with one and a half twists." }],
      },
    ],
  },
  {
    name: "Randolph",
    category: "single-somersaults",
    summary: "A single front somersault with two and a half twists.",
    aliases: ["Randy", "Randi", "Front two and a half twist"],
    tags: ["somersault", "twist", "forward"],
    quarterRotations: 4,
    halfTwists: 5,
    position: "straight",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A Randolph (or Randy) is a single front somersault with two and a half twists.",
        status: "limited",
        cites: [{ source: "wiki_terms", excerpt: "Randolph (or Randy) – A single front somersault with two and a half twists." }],
      },
    ],
  },
  {
    name: "Adolph",
    category: "single-somersaults",
    summary: "Most sources describe a single front somersault with three and a half twists; one club glossary uses the name differently.",
    aliases: ["Adolf", "Ady", "Front three and a half twist"],
    tags: ["somersault", "twist", "forward"],
    quarterRotations: 4,
    halfTwists: 7,
    position: "straight",
    evidence: "conflicting",
    publish: true,
    claims: [
      {
        statement: "An Adolph is a single front somersault with three and a half twists.",
        status: "limited",
        cites: [
          { source: "wiki_terms", excerpt: "Adolph – A single front somersault with three and a half twists." },
          { source: "nbc_gloss", excerpt: "a forward somersault with 3 1/2 twists" },
        ],
      },
      {
        statement: "One club glossary is reported to use “adolf/adolph” for a full in–half out rather than a single somersault; this conflicts with the definition above.",
        status: "disputed",
        cites: [
          {
            source: "bren_gloss",
            stance: "contradicts",
            excerpt: "Search summary: the \"adolf\" term is defined differently across sources (a forward somersault with 3 1/2 twists per NBC, versus full in–half out in the Brentwood glossary)",
          },
        ],
      },
    ],
  },
  {
    name: "Ball out",
    category: "single-somersaults",
    summary: "A one-and-a-quarter front somersault from a back landing to the feet.",
    aliases: ["Ballout", "Ball-out"],
    tags: ["somersault", "forward", "from back"],
    quarterRotations: 5,
    halfTwists: 0,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A ball out is a one and one quarter front somersault from back landing position that lands on the feet.",
        status: "limited",
        cites: [
          { source: "wiki_terms", excerpt: "Ballout – One and one quarter front somersault from back drop position that lands on feet." },
          { source: "bren_gloss", excerpt: "Search summary: starts on the back and finishes with a 1¼ front somersault landing on the feet." },
        ],
      },
      {
        statement: "A ball out is usually performed after a crash dive (¾ front somersault).",
        status: "limited",
        cites: [{ source: "wiki_terms", excerpt: "Usually performed after Crash Dive." }],
      },
    ],
  },
  {
    name: "Barani ball out",
    category: "single-somersaults",
    summary: "A ball out with a half twist: from the back, one and a quarter front somersault with a late half twist to feet.",
    aliases: ["BBO", "Ball out barani", "Ball-out barani"],
    tags: ["somersault", "twist", "forward", "from back"],
    quarterRotations: 5,
    halfTwists: 1,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A barani ball out (BBO) is the same as a ball out but with one half twist.",
        status: "limited",
        cites: [{ source: "wiki_terms", excerpt: "Barani ballout (BBO) – the same as a Ball out, but with one half twist." }],
      },
      {
        statement: "The Brentwood glossary describes it as starting on the back, 1¼ front somersault with a late ½ twist, and calls the name “barani – ball out” misleading because the ball-out element is initiated first.",
        status: "limited",
        cites: [
          {
            source: "bren_gloss",
            excerpt: "a move starting on the back, 1¼ front somersault with a late ½ twist … \"barani – ball out\" is a misleading (though more popular) name, because it puts emphasis on the barani rather than the ball-out element which is required to be initiated first.",
          },
        ],
      },
    ],
  },
  {
    name: "Cody",
    category: "single-somersaults",
    summary: "A one-and-a-quarter back somersault from a front landing to the feet.",
    aliases: ["Back cody"],
    tags: ["somersault", "backward", "from front"],
    quarterRotations: 5,
    halfTwists: 0,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A cody is a one and one quarter back somersault from front landing position that lands on the feet, usually performed after a lazy back.",
        status: "limited",
        cites: [
          {
            source: "wiki_terms",
            excerpt: "Cody – One and one quarter back somersault from front drop position that lands on feet. Usually performed after Lazy Back.",
          },
        ],
      },
    ],
  },
  {
    name: "Lazy back",
    category: "single-somersaults",
    summary: "A three-quarter straight back somersault that lands in front landing position.",
    aliases: ["Three quarter back", "3/4 back", "Easy back"],
    tags: ["somersault", "backward"],
    quarterRotations: 3,
    halfTwists: 0,
    position: "straight",
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A ¾ back (lazy back, easy back) is a three quarter straight back somersault that lands in front landing position.",
        status: "limited",
        cites: [
          { source: "wiki_terms", excerpt: "3/4 back (Lazy Back, Easy Back) – Three quarter straight back somersault that lands in front drop position." },
        ],
      },
      {
        statement: "Brentwood notes the name “lazy back” is now considered inappropriate because it suggests laziness, while the move requires full awareness.",
        status: "limited",
        cites: [{ source: "bren_gloss", excerpt: "Search summary: the name is now considered inappropriate because it suggests laziness, though the move itself requires full awareness." }],
      },
    ],
  },
  {
    name: "Crash dive",
    category: "single-somersaults",
    summary: "A three-quarter front somersault; Brentwood flags the name as outdated.",
    aliases: ["Three quarter front", "3/4 front"],
    tags: ["somersault", "forward"],
    quarterRotations: 3,
    halfTwists: 0,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A crash dive is a ¾ front somersault; the name is now considered incorrect because “crash” has a negative connotation.",
        status: "limited",
        cites: [{ source: "bren_gloss", excerpt: "Search summary: describes a ¾ front somersault; the club says the name is now considered incorrect because \"crash\" carries a negative connotation." }],
      },
    ],
  },
  {
    name: "Kaboom",
    category: "single-somersaults",
    summary: "A three-quarter back somersault from a back landing to the feet, driven by the heels bouncing off the bed.",
    aliases: ["Ka-boom", "Kaboom back"],
    tags: ["somersault", "backward", "from back"],
    quarterRotations: 3,
    halfTwists: 0,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A kaboom is a three quarter back somersault from back landing position that lands on the feet following the heels being bounced off the bed.",
        status: "limited",
        cites: [
          {
            source: "wiki_terms",
            excerpt: "Kaboom – Three quarter back somersault from back drop position that lands on feet following the heels being bounced off the canvas.",
          },
        ],
      },
      {
        statement: "The legs hit the bed momentarily after the body, reversing the rotation generated from the body.",
        status: "limited",
        cites: [{ source: "subath", excerpt: "The legs hit the trampoline bed momentarily after the body, reversing the rotation generated from the body" }],
      },
    ],
  },
  {
    name: "Porpoise",
    category: "single-somersaults",
    summary: "From a back landing, a front somersault back to a back landing; more commonly called a bounce roll.",
    aliases: ["Bounce roll", "Bounce-roll", "Dolphin"],
    tags: ["somersault", "forward", "from back"],
    quarterRotations: 4,
    halfTwists: 0,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A porpoise starts on the back, includes a front somersault and lands on the back again; it is more commonly called a bounce-roll or dolphin.",
        status: "limited",
        cites: [
          { source: "bren_gloss", excerpt: "Search summary: starts on the back, includes a front somersault, and lands on the back again. It is more commonly called a \"bounce-roll\" or \"dolphin\"" },
          { source: "wightflyers", excerpt: "Search summary: starts on the back, includes a front somersault, and lands on the back again." },
        ],
      },
    ],
  },
  {
    name: "Corkscrew",
    category: "single-somersaults",
    summary: "Sources disagree: either a half front somersault with 1½ twists to the back, or a cradle with an extra full twist.",
    aliases: ["Cork screw"],
    tags: ["twist", "from back"],
    halfTwists: 3,
    evidence: "conflicting",
    publish: true,
    claims: [
      {
        statement: "A corkscrew is a half front somersault with 1½ twists, ending on the back.",
        status: "disputed",
        cites: [
          { source: "bren_gloss", excerpt: "Search summary: a half front somersault with 1½ twists ending on the back." },
          { source: "wightflyers", excerpt: "Search summary: a half front somersault with 1½ twists ending on the back." },
        ],
      },
      {
        statement: "A corkscrew is a back landing, 1½ twists to back landing — a cradle with an extra full twist.",
        status: "disputed",
        cites: [
          { source: "twofoot", excerpt: "a back drop, 1½ twists to back drop (i.e. cradle with an extra full twist)" },
          { source: "nightflyers", excerpt: "Search summary: a cradle with an extra full twist." },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- multiple somersaults
  {
    name: "Fliffis",
    category: "multiple-somersaults",
    kind: "term",
    summary: "A double somersault with twist. Some glossaries narrow it to double front somersaults with at least a half twist.",
    aliases: ["Fliffus", "Fliff"],
    tags: ["double", "twist", "terminology"],
    quarterRotations: 8,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A fliffis is any double somersault with a twist.",
        status: "limited",
        cites: [{ source: "nbc_gloss", excerpt: "Search summary: Olympic-focused glossaries define fliffis as any double somersault with a twist." }],
      },
      {
        statement: "The Purley club glossary gives a narrower definition: a double front somersault with at least one half twist.",
        status: "limited",
        cites: [{ source: "purley", excerpt: "double front somersault with at least one half twist" }],
      },
    ],
  },
  {
    name: "Triffis",
    category: "multiple-somersaults",
    kind: "term",
    summary: "Any triple somersault combined with some twist.",
    aliases: ["Triffus", "Triff"],
    tags: ["triple", "twist", "terminology"],
    quarterRotations: 12,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A triffis is any triple somersault combined with a component of twist.",
        status: "limited",
        cites: [
          { source: "bren_gloss", excerpt: "any triple somersault combined with a component of twist" },
          { source: "subath", excerpt: "Search summary: lists Triffus as any triple somersault with twist." },
        ],
      },
    ],
  },
  {
    name: "Half out",
    category: "multiple-somersaults",
    summary: "A double front somersault with a half twist in the second somersault; usually called a barani out.",
    aliases: ["Barani out", "Half-out"],
    tags: ["double", "twist", "forward"],
    quarterRotations: 8,
    halfTwists: 1,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "“Half out” is more usually known as “barani out”: a double front somersault with a ½ twist in the second somersault.",
        status: "limited",
        cites: [{ source: "bren_gloss", excerpt: "\"half out\" is more usually known as \"barani out\", which is a double front somersault with a ½ twist in the 2nd somersault" }],
      },
    ],
  },
  {
    name: "Full in full out",
    category: "multiple-somersaults",
    summary: "A double back somersault with a full twist in each somersault.",
    aliases: ["Full-in full-out", "Full in, full out", "Double full double back"],
    tags: ["double", "twist", "backward"],
    quarterRotations: 8,
    halfTwists: 4,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "“Full in” places the full twist in the first somersault and “full out” in the second; a full in full out is a double back somersault with a full twist in each somersault.",
        status: "limited",
        cites: [
          {
            source: "purley",
            excerpt: "a double back somersault with a full twist in the first or second somersault respectively. Full in full out is a double back somersault with a full twist in each somersault.",
          },
        ],
      },
    ],
  },
  {
    name: "Miller",
    category: "multiple-somersaults",
    summary: "A double back somersault with three full twists, named after Wayne Miller; the twist distribution has varied over time.",
    aliases: ["Triple twisting double back", "Triple-twisting double back"],
    tags: ["double", "twist", "backward", "named skill"],
    quarterRotations: 8,
    halfTwists: 6,
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "A Miller is a double back somersault with three full twists, named after its creator Wayne Miller.",
        status: "limited",
        cites: [
          { source: "wiki_terms", excerpt: "the skill is named a \"miller\", after its creator Wayne Miller." },
          {
            source: "bren_gloss",
            excerpt: "triple-twisting double back somersault, originally performed as \"2½ in – ½ out\", nowadays usually performed as \"full in – double full out\", named after Wayne Miller",
          },
        ],
      },
      {
        statement: "It was originally performed as “2½ in – ½ out” and is nowadays usually performed as “full in – double full out”.",
        status: "limited",
        cites: [
          {
            source: "bren_gloss",
            excerpt: "originally performed as \"2½ in – ½ out\", nowadays usually performed as \"full in – double full out\"",
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- terminology & competition
  {
    name: "FIG numeric notation",
    category: "terminology",
    kind: "term",
    summary: "A shorthand that writes quarter somersault rotations, then half twists per somersault, then a body-position symbol.",
    aliases: ["FIG notation", "FIG shorthand", "Numeric notation"],
    tags: ["notation", "terminology"],
    evidence: "limited_evidence",
    publish: true,
    body: "Examples from the cited sources: 41/ is a straight front somersault with a half twist; 800o is a tucked double back somersault without twist; 821/ is a straight double with a full twist in the first somersault and a half twist in the second.",
    claims: [
      {
        statement: "FIG shorthand uses one digit for the number of quarter rotations, then digits for the number of half twists in each somersault, then a symbol for the position: “/” straight, “<” piked, “o” tucked.",
        status: "limited",
        cites: [
          {
            source: "wiki_tramp",
            excerpt:
              "FIG shorthand consists of one digit signifying the number of quarter rotations, followed by digits representing the number of half twists in each somersault, and a symbol representing the position of the skill. \"/\" represents a straight position, \"<\" represents a piked position, and \"ο\" represents a tucked position.",
          },
        ],
      },
    ],
  },
  {
    name: "Routine",
    category: "competition",
    kind: "rule",
    summary: "A competition exercise of ten elements (skills) performed consecutively.",
    aliases: ["Exercise", "Trampoline routine", "Ten-skill routine"],
    tags: ["competition", "rules"],
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "Under the FIG Code of Points 2025–2028 each exercise consists of ten elements.",
        status: "limited",
        cites: [{ source: "fig_cop", excerpt: "Each exercise consists of ten (10) elements." }],
      },
      {
        statement: "In trampolining a routine comprises ten consecutive skills.",
        status: "limited",
        cites: [{ source: "bren_routines", excerpt: "In Trampolining a \"Routine\" comprises ten consecutive skills" }],
      },
    ],
  },
  {
    name: "Trampoline scoring",
    category: "competition",
    kind: "rule",
    summary: "Routines are scored on difficulty, execution, horizontal displacement and time of flight, which are added together.",
    aliases: ["Scoring", "Score components"],
    tags: ["competition", "rules", "judging"],
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "Trampoline routines are scored on difficulty, execution, horizontal displacement and time of flight, and the four scores are added together to produce the final score.",
        status: "limited",
        cites: [{ source: "fig_news_dd", excerpt: "The four scores are added together to generate the final score." }],
      },
    ],
  },
  {
    name: "Difficulty",
    category: "competition",
    kind: "rule",
    summary: "The difficulty score is the sum of the values of the ten elements, driven by somersault rotation and twist.",
    aliases: ["Degree of difficulty", "DD", "Tariff"],
    tags: ["competition", "judging"],
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "The final difficulty score of a routine is the value of each of its ten elements added together.",
        status: "limited",
        cites: [{ source: "fig_news_dd", excerpt: "The final difficulty score of a routine is the value of each of the 10 elements in the routine added together." }],
      },
    ],
  },
  {
    name: "Time of flight",
    category: "competition",
    kind: "rule",
    summary: "A score component measured electronically from the time the athlete spends in the air.",
    aliases: ["ToF", "Flight time"],
    tags: ["competition", "judging"],
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "The FIG Code of Points evaluates time of flight in 1/100 of a second, and requires a measurement precision of 5 ms.",
        status: "limited",
        cites: [{ source: "fig_cop", excerpt: "time of flight measurement precision of 5 ms … time of flight is evaluated in 1/100 of a second" }],
      },
    ],
  },
  {
    name: "Horizontal displacement",
    category: "competition",
    kind: "rule",
    summary: "A score component based on where the athlete lands on the bed relative to the centre.",
    aliases: ["HD", "Displacement"],
    tags: ["competition", "judging"],
    evidence: "limited_evidence",
    publish: true,
    claims: [
      {
        statement: "Horizontal displacement is one of the four score components added into the final score.",
        status: "limited",
        cites: [{ source: "fig_news_dd", excerpt: "The four scores are added together to generate the final score." }],
      },
      {
        statement: "The FIG Code counts execution, horizontal displacement and time of flight for the first exercise of the qualifying round.",
        status: "limited",
        cites: [
          {
            source: "fig_cop",
            excerpt: "only the execution score plus the horizontal displacement and the time of flight of this exercise counted for the first exercise of the Qualifying Round",
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- known gaps (unsourced drafts)
  {
    name: "Back somersault",
    category: "single-somersaults",
    summary: "A full backward rotation from feet to feet. (Unsourced draft — needs sources before publication.)",
    aliases: ["Back salto", "Back flip", "Back tuck"],
    tags: ["somersault", "backward"],
    quarterRotations: 4,
    halfTwists: 0,
    evidence: "ai_draft",
    publish: false,
    claims: [],
  },
  {
    name: "Front somersault",
    category: "single-somersaults",
    summary: "A full forward rotation from feet to feet. (Unsourced draft — needs sources before publication.)",
    aliases: ["Front salto", "Front flip"],
    tags: ["somersault", "forward"],
    quarterRotations: 4,
    halfTwists: 0,
    evidence: "ai_draft",
    publish: false,
    claims: [],
  },
];

export const seedRelations: { from: string; to: string; kind: "related" | "variant_of" | "distinct_from" | "component_of"; note: string }[] = [
  { from: "Rudolph", to: "Barani", kind: "related", note: "Same single front somersault with more twist (1½ vs ½)." },
  { from: "Randolph", to: "Rudolph", kind: "related", note: "One more full twist than a Rudolph." },
  { from: "Adolph", to: "Randolph", kind: "related", note: "One more full twist than a Randolph (under the common definition)." },
  { from: "Barani ball out", to: "Ball out", kind: "variant_of", note: "A ball out with a half twist." },
  { from: "Cody", to: "Ball out", kind: "distinct_from", note: "Cody rotates backwards from the front; ball out rotates forwards from the back." },
  { from: "Lazy back", to: "Cody", kind: "related", note: "A cody is usually performed after a lazy back." },
  { from: "Crash dive", to: "Ball out", kind: "related", note: "A ball out is usually performed after a crash dive." },
  { from: "Kaboom", to: "Back landing", kind: "related", note: "Starts from a back landing." },
  { from: "Swivel hips", to: "Seat landing", kind: "component_of", note: "Built from two seat landings." },
  { from: "Front landing", to: "Back landing", kind: "distinct_from", note: "Opposite rotation direction and landing surface." },
  { from: "Tuck jump", to: "Tuck", kind: "related", note: "Shows the tuck shape." },
  { from: "Pike jump", to: "Pike", kind: "related", note: "Shows the pike shape." },
  { from: "Straddle jump", to: "Straddle", kind: "related", note: "Shows the straddle shape." },
  { from: "Half out", to: "Fliffis", kind: "variant_of", note: "A double front somersault with twist." },
  { from: "Full in full out", to: "Fliffis", kind: "related", note: "A twisting double somersault." },
  { from: "Miller", to: "Full in full out", kind: "related", note: "Both are twisting double back somersaults; the Miller adds another full twist." },
  { from: "Triffis", to: "Fliffis", kind: "distinct_from", note: "Triple vs double somersault." },
  { from: "Porpoise", to: "Ball out", kind: "related", note: "Both start from a back landing with forward rotation." },
  { from: "Corkscrew", to: "Porpoise", kind: "related", note: "Both start from the back." },
  { from: "Difficulty", to: "Trampoline scoring", kind: "component_of", note: "" },
  { from: "Time of flight", to: "Trampoline scoring", kind: "component_of", note: "" },
  { from: "Horizontal displacement", to: "Trampoline scoring", kind: "component_of", note: "" },
  { from: "Routine", to: "Trampoline scoring", kind: "related", note: "" },
  { from: "Seat landing", to: "Landing (formerly “drop”)", kind: "related", note: "" },
  { from: "Barani", to: "FIG numeric notation", kind: "related", note: "Written 41 in FIG notation." },
];
