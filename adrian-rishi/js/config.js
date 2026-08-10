// ══════════════════════════════════════════

//  CONFIG
// ══════════════════════════════════════════
const SUPABASE_URL  = 'https://wflujklyqelllpqqmnhf.supabase.co';
// ⚠️ Replace with your anon key from Supabase Dashboard → Project Settings → API → anon public
const SUPABASE_KEY  = 'sb_publishable_ANc-XNw0l6wtvzlANX9Jmw_Lj0MFqe-';
const CLOUDINARY_CLOUD  = 'dohnwz2ix';
const CLOUDINARY_PRESET = 'wedding_studio';

// ── Platform defaults ──
const DEFAULT_PLATFORM_ADMIN_USER = 'anton';
const DEFAULT_PLATFORM_ADMIN_PASS = '1234';
let PLATFORM_ADMIN_USER = DEFAULT_PLATFORM_ADMIN_USER;
let PLATFORM_ADMIN_PASS = DEFAULT_PLATFORM_ADMIN_PASS;
let platformName        = 'Rishiani Studio Flow';
let platformLogoUrl     = '';
let watermarkEnabled    = true; // global watermark state (used at upload time)
let ownerPicksWmDisabled = false; // studio owner's personal toggle to view Client Picks without watermark (does not affect client view)

// ── Studio map: studioCode → { name, password, storagePlan, logoUrl, displayName, customFolder1, customFolder2 }
// In production this would be in a DB. Here stored in localStorage.
let studiosDB = {};

// ── State ──
let currentRole    = null; // 'platform' | 'studio' | 'client'
let currentStudio  = null; // studio object
let currentProject = null;
let allPhotos      = [];
let clientOwnPhotos = [];
let selections     = {};
let projects       = [];
let activeCategory = 'all';
let customFolder1Name = 'Custom Folder 1';
let lbPhotos       = [];
let lbIndex        = 0;

// ══════════════════════════════════════════
