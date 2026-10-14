import React, { useState, useEffect } from "react";
import { FiSave, FiInfo } from "react-icons/fi";
import { toast } from "react-hot-toast";
import CardShell from "../../components/CardShell";
import API from "../../../../services/api";
import LogoLoader from "../../../../components/common/LogoLoader";

const Policies = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState("user");
  const [type, setType] = useState("terms");
  const [content, setContent] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    fetchPolicy();
  }, [role, type]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      const res = await API.get(`/content/policy/${role}/${type}`);
      if (res.data.success && res.data.data) {
        setContent(res.data.data.content || "");
        setIsDefault(!!res.data.data.isDefault);
      }
    } catch (error) {
      toast.error("Failed to load policy content");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await API.put('/content/policy', { role, type, content });
      if (res.data.success) {
        toast.success("Policy content updated successfully");
        setIsDefault(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Error saving content");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LogoLoader />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Manage Policies & Terms</h2>
      </div>

      <CardShell icon={FiInfo}>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg text-blue-800 text-sm flex gap-3 border border-blue-100">
             <FiInfo className="shrink-0 mt-0.5 text-blue-600" size={18} />
             <p>Manage Terms & Conditions and Privacy Policies for Users, Vendors and Workers. Only Super Admins can change these.  Until you save your own version, the starter text is shown to people, so a document is never blank. Select the role and document type, then update the content below.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-2">Select Role</label>
              <select 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="user">User</option>
                <option value="vendor">Vendor</option>
                <option value="worker">Worker</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">Select Document Type</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="terms">Terms & Conditions</option>
                <option value="privacy">Privacy Policy</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Content</label>
            {isDefault && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
                This is the starter text. Edit it and save to publish your own version.
              </p>
            )}
            <textarea 
              name="policyContent"
              required 
              rows="15" 
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none leading-relaxed" 
              value={content} 
              onChange={e => setContent(e.target.value)} 
              placeholder={`Write the ${type === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'} for ${role === 'user' ? 'Users' : role === 'vendor' ? 'Vendors' : 'Workers'}...`}
            />
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button 
              type="submit" 
              disabled={saving}
              className="px-8 py-3 bg-primary-600 text-white rounded-lg font-bold shadow-md hover:bg-primary-700 flex items-center gap-2 disabled:bg-primary-400"
            >
              <FiSave /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </CardShell>
    </div>
  );
};

export default Policies;
