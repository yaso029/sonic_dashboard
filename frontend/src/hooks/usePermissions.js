import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';

/**
 * Phase 3 RBAC — frontend permission gate.
 *
 * Fetches the flat permission map from `/api/auth/me/permissions` (the backend
 * permission matrix is the single source of truth) and exposes a synchronous
 * `can(resource, action)` helper for hiding UI the user isn't allowed to use.
 *
 * Permissions are cached in localStorage + a module-level cache so the map is
 * available immediately on subsequent renders and shared across components,
 * then refreshed from the API on mount.
 */

// Shared across all hook instances within a session.
let _cache = null; // { role, permissions, service_type_scope }

function readLocalCache() {
  try {
    const raw = localStorage.getItem('permissions');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function usePermissions() {
  const { user } = useAuth();

  const [perms, setPerms] = useState(() => {
    const cached = _cache || readLocalCache();
    // Only trust the cache if it belongs to the currently logged-in role.
    return cached && user && cached.role === user.role ? cached : null;
  });

  useEffect(() => {
    if (!user) {
      setPerms(null);
      return;
    }
    let active = true;
    api
      .get('/api/auth/me/permissions')
      .then(({ data }) => {
        if (!active) return;
        _cache = data;
        try {
          localStorage.setItem('permissions', JSON.stringify(data));
        } catch {
          /* ignore quota errors */
        }
        setPerms(data);
      })
      .catch(() => {
        /* leave whatever cache we have */
      });
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  const permissions = perms?.permissions || {};
  const serviceTypeScope = perms?.service_type_scope ?? null;

  const can = (resource, action) => {
    const actions = permissions[resource];
    if (!actions) return false;
    return actions.includes(action);
  };

  return {
    can,
    permissions,
    serviceTypeScope,
    role: perms?.role || user?.role || null,
    loading: perms == null,
  };
}
