import React, { useState, useEffect } from "react";
import { FiSave, FiInfo } from "react-icons/fi";
import { toast } from "react-hot-toast";
import CardShell from "../../components/CardShell";
import API from "../../../../services/api";
import LogoLoader from "../../../../components/common/LogoLoader";
import { uploadToCloudinary } from "../../../../services/cloudinaryService";
import { FiImage, FiX, FiVideo } from "react-icons/fi";

const getYouTubeEmbedUrl = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11)
      ? `https://www.youtube.com/embed/${match[2]}`
      : null;
};

const AboutUs = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  
  const [youtubeUrl, setYoutubeUrl] = useState("");
  
  const [form, setForm] = useState({
    title: "About GROO",
    content: "",
    images: [],
    videos: []
  });

  useEffect(() => {
    fetchAbout();
  }, []);

  const fetchAbout = async () => {
    try {
      setLoading(true);
      const res = await API.get('/content/about');
      if (res.data.success && res.data.data) {
        let initialVideos = res.data.data.videos || [];
        if (initialVideos.length === 0 && res.data.data.videoUrl) {
            initialVideos = [{ url: res.data.data.videoUrl, description: res.data.data.videoDescription || "" }];
        }
        setForm({
          title: res.data.data.title || "About GROO",
          content: res.data.data.content || "",
          images: res.data.data.images || [],
          videos: initialVideos
        });
      }
    } catch (error) {
      toast.error("Failed to load About Us content");
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    

    try {
      const loadingToast = toast.loading(`Uploading ${files.length} image(s)...`);
      const uploadPromises = files.map(file => uploadToCloudinary(file));
      const urls = await Promise.all(uploadPromises);
      
      const newImages = urls.map(url => ({ url, name: "" }));
      
      setForm(prev => ({ 
        ...prev, 
        images: [...prev.images, ...newImages] 
      }));
      
      toast.dismiss(loadingToast);
      toast.success("Images uploaded!");
    } catch (error) {
      toast.error("Failed to upload images");
    }
  };

  const handleVideoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
        toast.error('Please select a valid video file.');
        return;
    }

    try {
      setUploadingVideo(true);
      const loadingToast = toast.loading('Uploading video...');
      
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await API.post('/upload-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (res.data.success) {
        setForm(prev => ({ 
            ...prev, 
            videos: [...prev.videos, { url: res.data.videoUrl, description: '' }] 
        }));
        toast.success('Video uploaded successfully!');
      } else {
        toast.error('Failed to upload video');
      }
      toast.dismiss(loadingToast);
    } catch (error) {
      toast.error('Error uploading video');
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleAddYoutube = () => {
    if (!youtubeUrl) return;
    setForm(prev => ({
        ...prev,
        videos: [...prev.videos, { url: youtubeUrl, description: '' }]
    }));
    setYoutubeUrl("");
  };

  const removeVideo = (index) => {
    setForm(prev => ({
        ...prev,
        videos: prev.videos.filter((_, i) => i !== index)
    }));
  };

  const handleVideoDescChange = (index, desc) => {
    const updatedVideos = [...form.videos];
    updatedVideos[index].description = desc;
    setForm({ ...form, videos: updatedVideos });
  };

  const handleNameChange = (index, name) => {
    const updatedImages = [...form.images];
    updatedImages[index].name = name;
    setForm({ ...form, images: updatedImages });
  };

  const removeImage = (index) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await API.put('/content/about', form);
      if (res.data.success) {
        toast.success("About Us content updated");
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
        <h2 className="text-2xl font-bold">Manage About Us</h2>
      </div>

      <CardShell icon={FiInfo}>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          <div className="bg-green-50 p-4 rounded-lg text-green-800 text-sm flex gap-3 border border-green-100">
             <FiInfo className="shrink-0 mt-0.5 text-green-600" size={18} />
             <p>Write your "About Us" content below. Simply use the <b>Enter</b> key to start new paragraphs. No need to use any HTML tags.</p>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Section Title</label>
            <input 
              required 
              type="text" 
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" 
              value={form.title} 
              onChange={e => setForm({...form, title: e.target.value})} 
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Content (Description)</label>
            <textarea 
              required 
              rows="10" 
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none leading-relaxed" 
              value={form.content} 
              onChange={e => setForm({...form, content: e.target.value})} 
              placeholder="Write your company information here..."
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Featured Videos</label>
            
            {/* List of existing videos */}
            {form.videos.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {form.videos.map((vid, index) => (
                  <div key={index} className="p-4 border rounded-xl bg-gray-50 relative group">
                    <div className="flex items-center gap-2 mb-2">
                      <FiVideo className="text-gray-500" />
                      <span className="text-sm font-bold text-gray-700">Video {index + 1}</span>
                    </div>
                    <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm aspect-video bg-black">
                      {getYouTubeEmbedUrl(vid.url) ? (
                        <iframe
                          width="100%"
                          height="100%"
                          src={getYouTubeEmbedUrl(vid.url)}
                          title={`YouTube video ${index + 1}`}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      ) : (
                        <video 
                          width="100%" 
                          height="100%" 
                          controls 
                          className="w-full h-full object-contain"
                          src={vid.url}
                        >
                          Your browser does not support the video tag.
                        </video>
                      )}
                    </div>
                    <div className="mt-3">
                      <label className="block text-[11px] font-bold text-gray-600 mb-1 uppercase tracking-wider">Video Description</label>
                      <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 outline-none text-sm" 
                        value={vid.description} 
                        onChange={(e) => handleVideoDescChange(index, e.target.value)} 
                        placeholder="Enter a brief description..."
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={() => removeVideo(index)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      title="Remove Video"
                    >
                      <FiX size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new video */}
            <div className="p-4 border rounded-xl bg-white shadow-sm border-gray-200">
                <h4 className="text-sm font-bold text-gray-800 mb-3">Add a New Video</h4>
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1 flex gap-2">
                    <input 
                      type="url" 
                      className="flex-1 px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" 
                      value={youtubeUrl} 
                      onChange={e => setYoutubeUrl(e.target.value)} 
                      placeholder="Enter YouTube URL"
                    />
                    <button 
                        type="button"
                        onClick={handleAddYoutube}
                        className="px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700 transition-colors whitespace-nowrap"
                    >
                        Add URL
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 font-bold px-2">OR</span>
                    <label className={`px-4 py-2.5 ${uploadingVideo ? 'bg-gray-300' : 'bg-gray-100 hover:bg-gray-200'} border border-gray-300 rounded-lg cursor-pointer text-sm font-bold transition-colors whitespace-nowrap text-gray-700`}>
                      {uploadingVideo ? 'Uploading...' : 'Upload Video File'}
                      <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} disabled={uploadingVideo} />
                    </label>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">You can add multiple YouTube links or upload video files (max 100MB per file).</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Featured Images (About Section)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {form.images.map((img, index) => (
                <div key={index} className="space-y-2">
                  <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 group shadow-sm">
                    <img src={img.url} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <FiX size={14} />
                    </button>
                  </div>
                  <input 
                    type="text"
                    placeholder="Image label (e.g. Rental)"
                    className="w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-primary-500 outline-none"
                    value={img.name}
                    onChange={(e) => handleNameChange(index, e.target.value)}
                  />
                </div>
              ))}
              
              <label className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group shadow-sm">
                <FiImage className="w-8 h-8 mb-1 text-gray-400 group-hover:text-primary-500 transition-colors" />
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Add Image</span>
                <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageChange} />
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-3">These images and their names will appear on the homepage About section.</p>
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

export default AboutUs;
