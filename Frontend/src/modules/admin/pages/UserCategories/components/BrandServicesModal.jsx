import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX } from 'react-icons/fi';
import { toastManager } from '../../../../../utils/toastManager';
import Modal from './Modal'; // Assuming Modal is in same directory
import { serviceService } from '../../../../../services/catalogService';
import { z } from 'zod';

const serviceSchema = z.object({
  title: z.string().min(2, "Title is required"),
  basePrice: z.number().min(0, "Price must be non-negative"),
  gstPercentage: z.number().min(0).max(100).default(18),
  discountPrice: z.number().optional(),
  pricing_context: z.enum(['standalone', 'sub-category', 'any']).default('any'),
  parentSourceId: z.string().nullable().optional()
});

const BrandServicesModal = ({ isOpen, onClose, brand }) => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: '',
    basePrice: '',
    gstPercentage: 18,
    discountPrice: '',
    pricing_context: 'any',
    parentSourceId: ''
  });

  useEffect(() => {
    if (isOpen && brand) {
      loadServices();
    } else {
      setServices([]);
      resetForm();
    }
  }, [isOpen, brand]);

  const loadServices = async () => {
    try {
      setLoading(true);
      const response = await serviceService.getAll({ brandId: brand.id });
      if (response.success) {
        setServices(response.services || []);
      }
    } catch (error) {
      console.error('Failed to load services:', error);
      toastManager.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      title: '',
      basePrice: '',
      gstPercentage: 18,
      discountPrice: '',
      pricing_context: 'any',
      parentSourceId: ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Parse numbers
    const data = {
      title: form.title,
      basePrice: Number(form.basePrice),
      gstPercentage: Number(form.gstPercentage),
      discountPrice: form.discountPrice ? Number(form.discountPrice) : undefined,
      pricing_context: form.pricing_context,
      parentSourceId: form.parentSourceId || null
    };

    const result = serviceSchema.safeParse(data);
    if (!result.success) {
      toastManager.error((result.error.issues || result.error.errors)[0].message);
      return;
    }

    try {
      setLoading(true);
      if (editingId) {
        const response = await serviceService.update(editingId, {
          ...result.data,
          brandId: brand.id
        });
        if (response.success) {
          toastManager.success('Service updated');
          loadServices();
          resetForm();
        }
      } else {
        const response = await serviceService.create({
          ...result.data,
          brandId: brand.id
        });
        if (response.success) {
          toastManager.success('Service created');
          loadServices();
          resetForm();
        }
      }
    } catch (error) {
      console.error('Save service error:', error);
      toastManager.error(error.response?.data?.message || 'Failed to save service');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await serviceService.delete(id);
      toastManager.success('Service deleted');
      loadServices();
    } catch (error) {
      toastManager.error('Failed to delete service');
    }
  };

  const handleEdit = (service) => {
    setEditingId(service.id || service._id);
    setForm({
      title: service.title,
      basePrice: service.basePrice,
      gstPercentage: service.gstPercentage || 18,
      discountPrice: service.discountPrice || '',
      pricing_context: service.pricing_context || 'any',
      parentSourceId: service.parentSourceId || ''
    });
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Manage Equipment for ${brand?.title}`} size="xl">
      <div className="space-y-6">
        {/* Form */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
            {editingId ? 'Edit Equipment' : 'Add New Equipment'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Equipment Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Tractor 50HP with Plow"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Base Price (₹)</label>
                <input
                  type="number"
                  value={form.basePrice}
                  onChange={e => setForm(p => ({ ...p, basePrice: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">GST %</label>
                <input
                  type="number"
                  value={form.gstPercentage}
                  onChange={e => setForm(p => ({ ...p, gstPercentage: e.target.value }))}
                  placeholder="18"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end border-t pt-4 mt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Pricing Context</label>
                <select
                  value={form.pricing_context}
                  onChange={e => setForm(p => ({ ...p, pricing_context: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="any">Global (Any context)</option>
                  <option value="standalone">Standalone Rental</option>
                  <option value="sub-category">Sub-category placement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Parent Source (Optional)</label>
                <select
                  value={form.parentSourceId}
                  onChange={e => setForm(p => ({ ...p, parentSourceId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="">None (Global for this context)</option>
                  {/* Ideally we list other brands/categories here if needed, but for now just input or generic choice */}
                  {brand?.categoryIds?.map(catId => (
                    <option key={catId} value={catId}>Category ID: {catId.slice(-6)}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                  {editingId ? 'Update' : 'Add'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* List */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Context</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">GST</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {services.map(service => (
                <tr key={service.id || service._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{service.title}</div>
                    {service.parentSourceId && (
                      <div className="text-[10px] text-gray-400">Source: ...{service.parentSourceId.slice(-6)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      service.pricing_context === 'standalone' ? 'bg-blue-100 text-blue-700' :
                      service.pricing_context === 'sub-category' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {service.pricing_context || 'any'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-bold">₹{service.basePrice}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{service.gstPercentage}%</td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2">
                    <button
                      onClick={() => handleEdit(service)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(service.id || service._id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-sm text-gray-500">
                    No equipment found for this brand. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

export default BrandServicesModal;
