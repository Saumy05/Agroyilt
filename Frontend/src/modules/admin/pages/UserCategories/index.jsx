import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ensureIds, loadCatalog, saveCatalog } from "./utils";
import { categoryService } from "../../../../services/catalogService";
import HomePage from "./pages/HomePage";
import CategoriesPage from "./pages/CategoriesPage";
import ServicesPage from "./pages/ServicesPage";
import BrandsPage from "./pages/BrandsPage";

const UserCategories = () => {
  const [catalog, setCatalog] = useState(() => ensureIds(loadCatalog()));

  // Fetch real database categories on mount so all child tabs have real data
  useEffect(() => {
    const fetchRealCategories = async () => {
      try {
        const res = await categoryService.getAll({ status: 'active' });
        if (res.success && Array.isArray(res.categories)) {
          const mapped = res.categories.map(cat => ({
            ...cat,
            id: (cat.id || cat._id?.$oid || cat._id)?.toString() || "",
            title: cat.title,
            slug: cat.slug,
            homeIconUrl: cat.homeIconUrl || "",
            homeBadge: cat.homeBadge || "",
            hasSaleBadge: cat.hasSaleBadge || false,
            showOnHome: cat.showOnHome !== false,
            homeOrder: cat.homeOrder || 0,
            bookingType: cat.bookingType || 'VENDOR',
            fulfillmentMode: cat.fulfillmentMode || 'service',
            sectionType: cat.sectionType || 'General',
            trackingType: cat.trackingType || 'none',
            requiresDriver: Boolean(cat.requiresDriver),
            adminBaseCharge: cat.adminBaseCharge || 0,
            parentCategory: cat.parentCategory ? (cat.parentCategory._id || cat.parentCategory.id || cat.parentCategory).toString() : null,
            parentCategories: Array.isArray(cat.parentCategories) ? cat.parentCategories.map(p => (p._id || p.id || p).toString()) : [],
            isAlwaysMain: Boolean(cat.isAlwaysMain),
            scope: (!cat.scope || cat.scope === 'GLOBAL') ? 'GLOBAL_INDIA' : cat.scope,
            stateId: cat.stateId || null,
            state: cat.state || null,
            districtId: cat.districtId || null,
            district: cat.district || null,
            subDistrictId: cat.subDistrictId || null,
            subDistrict: cat.subDistrict || null
          }));
          setCatalog(prev => {
            const next = { ...prev, categories: mapped };
            saveCatalog(next);
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to load real categories in UserCategories:", err);
      }
    };
    fetchRealCategories();
  }, []);

  useEffect(() => {
    const handler = () => setCatalog(ensureIds(loadCatalog()));
    window.addEventListener("adminUserAppCatalogUpdated", handler);
    return () => window.removeEventListener("adminUserAppCatalogUpdated", handler);
  }, []);

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <Routes>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomePage catalog={catalog} setCatalog={setCatalog} />} />
          <Route path="categories" element={<CategoriesPage catalog={catalog} setCatalog={setCatalog} />} />
          <Route path="sections" element={<ServicesPage catalog={catalog} setCatalog={setCatalog} />} />
          <Route path="brands" element={<BrandsPage catalog={catalog} setCatalog={setCatalog} />} />

          <Route path="*" element={<Navigate to="home" replace />} />
        </Routes>
      </motion.div>
    </div>
  );
};

export default UserCategories;


