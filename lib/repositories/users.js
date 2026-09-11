const { supabase } = require("../supabase");

async function findUserByUsername(username) {
  const normalized = String(username || "").trim();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, username, legacy_id, avatar_url, description, created_at, updated_at")
    .ilike("username", normalized)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function createUser({ username, legacyId = null, avatarUrl = null, description = "" }) {
  const { data, error } = await supabase
    .from("users")
    .insert({
      username: String(username).trim(),
      legacy_id: legacyId,
      avatar_url: avatarUrl,
      description: String(description || "").slice(0, 300),
    })
    .select("id, username, legacy_id, avatar_url, description, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateUser(legacyId, patch) {
  const update = {};
  if (typeof patch.avatarUrl === "string") update.avatar_url = patch.avatarUrl;
  if (patch.avatarUrl === null) update.avatar_url = null;
  if (typeof patch.description === "string") update.description = patch.description.slice(0, 300);
  if (!Object.keys(update).length) return findUserByLegacyId(legacyId);

  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("legacy_id", legacyId)
    .select("id, username, legacy_id, avatar_url, description, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function findUserByLegacyId(legacyId) {
  if (!legacyId) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, username, legacy_id, avatar_url, description, created_at, updated_at")
    .eq("legacy_id", legacyId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureLegacyId(userId, legacyId) {
  const existing = await findUserByLegacyId(legacyId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("users")
    .update({ legacy_id: legacyId })
    .eq("id", userId)
    .is("legacy_id", null)
    .select("id, username, legacy_id, avatar_url, description, created_at, updated_at")
    .maybeSingle();

  if (error) throw error;
  return data || findUserByLegacyId(legacyId);
}

module.exports = {
  findUserByUsername,
  findUserByLegacyId,
  createUser,
  updateUser,
  ensureLegacyId,
};
