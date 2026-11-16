/**
 * Single source of truth for the database enums.
 *
 * Declared as `as const` arrays rather than bare union types so the values are
 * available at runtime — for validating API input, and for rendering filter
 * controls without restating the options. The derived unions are what the
 * generated database types line up against.
 */

export const SOURCE_TYPES = [
  'scientific_paper',
  'non_peer_reviewed_article',
  'white_paper',
  'blog',
  'linkedin_post',
  'report',
  'press_release',
  'other',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = ['unread', 'skimmed', 'read', 'synthesized'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const INGEST_STATUSES = [
  'pending',
  'fetching',
  'extracting',
  'chunking',
  'embedding',
  'complete',
  'failed',
] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

export const SIMILARITY_TYPES = ['duplicate', 'related', 'contradicts'] as const;
export type SimilarityType = (typeof SIMILARITY_TYPES)[number];

/** Human-readable labels for the reading-status enum. */
export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  unread: 'Unread',
  skimmed: 'Skimmed',
  read: 'Read',
  synthesized: 'Synthesized',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  scientific_paper: 'Scientific Paper',
  non_peer_reviewed_article: 'Non-Peer-Reviewed Article',
  white_paper: 'White Paper',
  blog: 'Blog',
  linkedin_post: 'LinkedIn post',
  report: 'Report',
  press_release: 'Press release',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Compound markets (Product Idea Radar toggle)
// ---------------------------------------------------------------------------

export const COMPOUND_MARKETS = ['industrial', 'pharma', 'both'] as const;
export type CompoundMarket = (typeof COMPOUND_MARKETS)[number];

export const COMPOUND_MARKET_LABELS: Record<CompoundMarket, string> = {
  industrial: 'Industrial',
  pharma: 'Pharma',
  both: 'Both',
};

/**
 * Definitions given to the model when it tags compounds; also the tooltips
 * on the product page picker.
 */
export const COMPOUND_MARKET_DEFINITIONS: Record<CompoundMarket, string> = {
  industrial:
    'food and feed ingredients, sweeteners, flavors, proteins, nutraceuticals, chemicals, fuels, materials, cosmetics, agriculture',
  pharma: 'active pharmaceutical ingredients, pharma starting materials and intermediates, drug and vaccine components',
  both: 'meaningful commercial use in both industrial and pharma markets (e.g. squalene: cosmetics and vaccine adjuvant)',
};

/** Biochemical class of a compound (`molecule_class` enum). */
export const MOLECULE_CLASSES = [
  'small_molecule',
  'oligosaccharide',
  'peptide',
  'protein',
  'enzyme',
  'nucleic_acid',
  'polysaccharide',
  'lipid',
  'polymer',
  'biomass',
  'mixture',
  'other',
] as const;
export type MoleculeClass = (typeof MOLECULE_CLASSES)[number];

export const MOLECULE_CLASS_LABELS: Record<MoleculeClass, string> = {
  small_molecule: 'Small molecule',
  oligosaccharide: 'Oligosaccharide',
  peptide: 'Peptide',
  protein: 'Protein',
  enzyme: 'Enzyme',
  nucleic_acid: 'Nucleic acid',
  polysaccharide: 'Polysaccharide',
  lipid: 'Lipid / oil',
  polymer: 'Polymer',
  biomass: 'Biomass',
  mixture: 'Mixture / extract',
  other: 'Other',
};

/** Definitions given to the model; also shown as tooltips. */
export const MOLECULE_CLASS_DEFINITIONS: Record<MoleculeClass, string> = {
  small_molecule:
    'a single defined small organic compound (e.g. vanillin, rebaudioside M, squalene, 1,4-butanediol, an API)',
  oligosaccharide: 'a short sugar chain of 2–10 units (e.g. 2\'-fucosyllactose, other human milk oligosaccharides)',
  peptide: 'a short chain of amino acids, under ~50 (e.g. collagen peptides, GLP-1 analogues)',
  protein:
    'a non-enzymatic protein, including engineered or sweet proteins (e.g. brazzein, β-lactoglobulin, ovalbumin, heme protein)',
  enzyme: 'a protein used for its catalytic activity (e.g. chymosin, amylase, lipase)',
  nucleic_acid: 'DNA or RNA products (e.g. mRNA, plasmid DNA, oligonucleotides)',
  polysaccharide: 'a long sugar polymer (e.g. hyaluronic acid, xanthan gum, bacterial cellulose)',
  lipid: 'fats, oils and fatty acids (e.g. DHA, structured lipids, microbial oils)',
  polymer: 'non-sugar biopolymers and bio-based plastics (e.g. PHA, PLA, spider silk fibres)',
  biomass: 'whole-cell or biomass products (e.g. mycoprotein, single-cell protein, yeast extract)',
  mixture: 'a blend, extract or formulation without one defined compound',
  other: 'none of the above',
};

/** How a compound is made (`production_method` enum), recorded per source. */
export const PRODUCTION_METHODS = [
  'natural_extraction',
  'precision_fermentation',
  'biomass_fermentation',
  'traditional_fermentation',
  'enzymatic_conversion',
  'chemical_synthesis',
  'cell_culture',
  'plant_molecular_farming',
  'other',
] as const;
export type ProductionMethod = (typeof PRODUCTION_METHODS)[number];

export const PRODUCTION_METHOD_LABELS: Record<ProductionMethod, string> = {
  natural_extraction: 'Natural extraction',
  precision_fermentation: 'Precision fermentation',
  biomass_fermentation: 'Biomass fermentation',
  traditional_fermentation: 'Traditional fermentation',
  enzymatic_conversion: 'Enzymatic conversion',
  chemical_synthesis: 'Chemical synthesis',
  cell_culture: 'Cell culture',
  plant_molecular_farming: 'Plant molecular farming',
  other: 'Other',
};

export const PRODUCTION_METHOD_DEFINITIONS: Record<ProductionMethod, string> = {
  natural_extraction: 'extracted or purified from a plant, animal or other natural source',
  precision_fermentation:
    'made by an engineered microbe (yeast, fungus, bacteria) that secretes or produces the specific molecule',
  biomass_fermentation: 'the microbial biomass itself is the product (e.g. mycoprotein, single-cell protein)',
  traditional_fermentation: 'conventional fermentation with unmodified organisms (e.g. lactic acid, citric acid)',
  enzymatic_conversion: 'made from a feedstock by isolated enzymes (biocatalysis, bioconversion)',
  chemical_synthesis: 'made by organic or industrial chemical synthesis',
  cell_culture: 'grown in animal or plant cell culture',
  plant_molecular_farming: 'expressed in engineered plants',
  other: 'another route',
};

/** Kinds of name a product goes by (`alias_kind` enum). */
export const ALIAS_KINDS = ['name', 'brand', 'abbreviation', 'pubchem'] as const;
export type AliasKind = (typeof ALIAS_KINDS)[number];

export const ALIAS_KIND_LABELS: Record<AliasKind, string> = {
  name: 'Names',
  brand: 'Brand names',
  abbreviation: 'Abbreviations',
  pubchem: 'PubChem synonyms',
};

// ---------------------------------------------------------------------------
// Funding opportunities
// ---------------------------------------------------------------------------

export const FUNDING_STATUSES = ['open', 'closed', 'applied'] as const;
export type FundingStatus = (typeof FUNDING_STATUSES)[number];

export const FUNDING_STATUS_LABELS: Record<FundingStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  applied: 'Applied',
};

// ---------------------------------------------------------------------------
// Sources feed
// ---------------------------------------------------------------------------

export const FEED_SOURCE_TYPES = ['openalex', 'web', 'commercial'] as const;
export type FeedSourceType = (typeof FEED_SOURCE_TYPES)[number];

export const FEED_SOURCE_TYPE_LABELS: Record<FeedSourceType, string> = {
  openalex: 'Academic (OpenAlex)',
  web: 'News (open web)',
  commercial: 'Commercial (wires & trade press)',
};

/** What a feed item is most likely worth reading for (`feed_signal` enum). */
export const FEED_SIGNALS = [
  'funding',
  'partnership',
  'acquisition',
  'product_launch',
  'offtake_supply',
  'capacity',
  'regulatory',
  'setback',
  'research',
  'market_analysis',
  'other',
] as const;
export type FeedSignal = (typeof FEED_SIGNALS)[number];

export const FEED_SIGNAL_LABELS: Record<FeedSignal, string> = {
  funding: 'Funding',
  partnership: 'Partnership',
  acquisition: 'Acquisition',
  product_launch: 'Product launch',
  offtake_supply: 'Offtake / supply',
  capacity: 'Capacity / scale-up',
  regulatory: 'Regulatory',
  setback: 'Setback',
  research: 'Research',
  market_analysis: 'Market analysis',
  other: 'Other',
};

/** Definitions given to the classifier; also shown as badge tooltips. */
export const FEED_SIGNAL_DEFINITIONS: Record<FeedSignal, string> = {
  funding: 'a funding round, grant, IPO or other raise',
  partnership: 'a partnership, collaboration, joint venture, licensing or distribution deal',
  acquisition: 'an acquisition, merger or asset purchase',
  product_launch: 'a product or ingredient launch, or commercial availability',
  offtake_supply: 'an offtake, supply or manufacturing contract with a named customer',
  capacity: 'a new plant, scale-up, capacity expansion or manufacturing milestone',
  regulatory: 'a regulatory approval, filing or policy decision (GRAS, FDA, EFSA, novel food…)',
  setback: 'a shutdown, layoffs, bankruptcy, pivot, recall or failed deal',
  research: 'a technical or R&D result',
  market_analysis: 'market, pricing or industry-trend analysis or commentary',
  other: 'none of the above',
};

export const FEED_ITEM_STATUSES = ['new', 'reviewed', 'dismissed', 'ingested'] as const;
export type FeedItemStatus = (typeof FEED_ITEM_STATUSES)[number];

export const FEED_ITEM_STATUS_LABELS: Record<FeedItemStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  dismissed: 'Dismissed',
  ingested: 'Ingested',
};

// ---------------------------------------------------------------------------
// Theses
// ---------------------------------------------------------------------------

export const THESIS_STATUSES = ['open', 'confirmed', 'refuted', 'unresolved'] as const;
export type ThesisStatus = (typeof THESIS_STATUSES)[number];

export const THESIS_STATUS_LABELS: Record<ThesisStatus, string> = {
  open: 'Open',
  confirmed: 'Confirmed',
  refuted: 'Refuted',
  unresolved: 'Unresolved',
};

export const THESIS_STANCES = ['supports', 'contradicts', 'context'] as const;
export type ThesisStance = (typeof THESIS_STANCES)[number];

export const THESIS_STANCE_LABELS: Record<ThesisStance, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  context: 'Context',
};

// ---------------------------------------------------------------------------
// Embedding configuration
// ---------------------------------------------------------------------------

/**
 * Embedding configuration. The dimension is baked into the `vector(1024)`
 * columns and their HNSW indexes, so changing model here means a migration
 * plus a full re-embed — `chunks.embedding_model` records which model produced
 * each row so that migration can be done incrementally.
 */
export const EMBEDDING_MODEL = 'cohere/embed-v4.0';
export const EMBEDDING_DIMENSIONS = 1024;

/** Routes that require an authenticated session. */
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/source',
  '/product',
  '/chat',
  '/funding',
  '/feed',
  '/capture',
  '/maintenance',
  '/theses',
] as const;
