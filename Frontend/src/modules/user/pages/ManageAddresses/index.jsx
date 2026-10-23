import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toastManager } from '../../../../utils/toastManager';
import { FiArrowLeft, FiPlus, FiMoreVertical, FiEdit2, FiTrash2, FiMapPin, FiNavigation, FiCheck } from 'react-icons/fi';
import AddressSelectionModal from '../Checkout/components/AddressSelectionModal';
import { userAuthService } from '../../../../services/authService';

import { z } from "zod";

// Zod schema for Address validation
const MAX_ADDRESSES = 5;

const addressSchema = z.object({
  addressLine1: z.string().min(5, "Address location is too short"),
  addressLine2: z.string().optional(), // House Number
  city: z.string().min(2, "City name is required"),
  state: z.string().min(2, "State is required"),
  pincode: z.string().regex(/^\d{6}$/, "Invalid Pincode format"),
});

const ManageAddresses = () => {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]); // Stores Red raw DB address objects
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMenu, setShowMenu] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [houseNumber, setHouseNumber] = useState('');

  // Fetch addresses on mount
  useEffect(() => {
    fetchAddresses();
  }, []);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      const response = await userAuthService.getProfile();
      if (response.success && response.user?.addresses) {
        setAddresses(response.user.addresses);
      }
    } catch {
      toastManager.error('Failed to load addresses');
    } finally {
      setLoading(false);
    }
  };


  const handleAddAddress = () => {
    if (addresses.length >= MAX_ADDRESSES) {
      toastManager.error(`You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`);
      return;
    }
    setEditingAddress(null);
    setHouseNumber('');
    setShowAddModal(true);
  };

  const handleEdit = (address) => {
    setEditingAddress(address);
    setHouseNumber(address.addressLine2 || '');
    setShowMenu(null);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingAddress(null);
    setHouseNumber('');
  };

  const getComponent = (components, type) => {
    return components?.find(c => c.types.includes(type)) ?.long_name || '';
  };

  const handleSaveAddress = async (savedHouseNumber, locationObj) => {
    try {
      if (!locationObj) {
        toastManager.error('Please select a location on the map');
        return;
      }

      // Extract details
      const components = locationObj.components || [];
      const city = getComponent(components, 'locality') || getComponent(components, 'administrative_area_level_2') || '';
      const state = getComponent(components, 'administrative_area_level_1') || '';
      const pincode = getComponent(components, 'postal_code') || '';

      // Zod Validation Preparation
      const addressData = {
        addressLine1: locationObj.address,
        addressLine2: savedHouseNumber,
        city,
        state,
        pincode
      };

      const validationResult = addressSchema.safeParse(addressData);
      if (!validationResult.success) {
        toastManager.error(validationResult.error?.issues?.[0]?.message || 'Please check the address details');
        return;
      }

      const fields = {
        ...addressData,
        lat: locationObj.lat,
        lng: locationObj.lng
      };

      let updatedAddresses;
      if (editingAddress) {
        // Editing keeps the address's default flag and any other saved details
        const editId = editingAddress._id || editingAddress.id;
        updatedAddresses = addresses.map(a => ((a._id || a.id) === editId ? { ...a, ...fields } : a));
      } else {
        if (addresses.length >= MAX_ADDRESSES) {
          toastManager.error(`You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`);
          return;
        }
        updatedAddresses = [
          ...addresses,
          { type: addresses.length === 0 ? 'home' : 'other', ...fields, isDefault: addresses.length === 0 }
        ];
      }

      // Call API
      toastManager.info('Saving address...');
      const response = await userAuthService.updateProfile({ addresses: updatedAddresses });
      toastManager.dismissAll();

      if (response.success) {
        setAddresses(response.user.addresses || updatedAddresses);
        toastManager.success(editingAddress ? 'Address updated!' : 'Address added!');
        handleCloseModal();
      } else {
        toastManager.error(response.message || 'Failed to save address');
      }

    } catch {
      toastManager.dismissAll();
      toastManager.error('Something went wrong');
    }
  };

  const handleDelete = async (addressId) => {
    try {
      const updatedAddresses = addresses.filter(addr => (addr._id || addr.id) !== addressId);

      toastManager.info('Deleting address...');
      const response = await userAuthService.updateProfile({ addresses: updatedAddresses });
      toastManager.dismissAll();

      if (response.success) {
        setAddresses(response.user.addresses || updatedAddresses);
        setShowMenu(null);
        toastManager.success('Address deleted successfully!');
      } else {
        toastManager.error('Failed to delete address');
      }
    } catch {
      toastManager.dismissAll();
      toastManager.error('Failed to delete address');
    }
  };

  const handleSetDefault = async (addressId) => {
    try {
      const updatedAddresses = addresses.map(a => ({ ...a, isDefault: (a._id || a.id) === addressId }));
      toastManager.info('Updating default address...');
      const response = await userAuthService.updateProfile({ addresses: updatedAddresses });
      toastManager.dismissAll();
      if (response.success) {
        setAddresses(response.user.addresses || updatedAddresses);
        setShowMenu(null);
        toastManager.success('Default address updated!');
      } else {
        toastManager.error(response.message || 'Failed to update default address');
      }
    } catch {
      toastManager.dismissAll();
      toastManager.error('Failed to update default address');
    }
  };

  const handleMenuToggle = (addressId) => {
    setShowMenu(showMenu === addressId ? null : addressId);
  };

  return (
    <div className="min-h-screen bg-white pb-4">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiArrowLeft className="w-5 h-5 text-black" />
            </button>
            <h1 className="text-xl font-bold text-black">Manage Addresses</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4">


        {/* Saved Addresses Section */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Saved Addresses ({addresses.length}/{MAX_ADDRESSES})</h2>
          {addresses.length < MAX_ADDRESSES && (
            <button
              onClick={handleAddAddress}
              className="flex items-center gap-1.5 text-sm font-bold text-purple-600"
            >
              <FiPlus className="w-4 h-4" />
              Add Address
            </button>
          )}
        </div>

        {/* Loading State */}
        {loading && addresses.length === 0 && (
          <div className="py-10 text-center">
            <div className="w-8 h-8 border-4 border-gray-100 border-t-purple-600 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">Loading your addresses...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && addresses.length === 0 && (
          <div className="py-10 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <FiMapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 font-medium">No saved addresses yet</p>
          </div>
        )}

        {/* Address List */}
        <div className="space-y-4">
          {addresses.map((address) => (
            <div
              key={address._id || address.id}
              className="bg-white border border-gray-200 rounded-xl p-4 relative"
            >
              {/* Menu Button */}
              <button
                onClick={() => handleMenuToggle(address._id || address.id)}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FiMoreVertical className="w-5 h-5 text-gray-600" />
              </button>

              {/* Menu Dropdown */}
              {showMenu === (address._id || address.id) && (
                <div className="absolute top-12 right-4 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px]">
                  {!address.isDefault && (
                    <button
                      onClick={() => handleSetDefault(address._id || address.id)}
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                    >
                      <FiCheck className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-700 whitespace-nowrap">Set as default</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(address)}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                  >
                    <FiEdit2 className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700">Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(address._id || address.id)}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 transition-colors text-left text-red-600"
                  >
                    <FiTrash2 className="w-4 h-4" />
                    <span className="text-sm">Delete</span>
                  </button>
                </div>
              )}

              {/* Address Content */}
              <div className="pr-12">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-bold uppercase text-gray-600">
                    {address.type || 'HOME'}
                  </span>
                  {address.isDefault && (
                    <span className="px-2 py-0.5 bg-green-100 rounded text-xs font-bold uppercase text-green-700">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700 mb-2 leading-relaxed font-medium">
                  {/* Combined line 1 & 2 for title-like display if needed, or just full address */}
                  {address.addressLine2 ? `${address.addressLine2}, ` : ''}{address.addressLine1}
                </p>
                <p className="text-xs text-gray-500">
                  {[address.city, address.state].filter(Boolean).join(', ')}{address.pincode ? ` - ${address.pincode}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Address Selection Modal (Reuse from Checkout) */}
      <AddressSelectionModal
        isOpen={showAddModal}
        onClose={handleCloseModal}
        houseNumber={houseNumber}
        onHouseNumberChange={setHouseNumber}
        onSave={handleSaveAddress}
      />

      {/* Close menu when clicking outside */}
      {showMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowMenu(null)}
        />
      )}
    </div>
  );
};

export default ManageAddresses;

