const safeName = (name) => String(name || 'download').replace(/[^\w.-]+/g, '_');

const extensionOf = (url, blob) => {
  const fromUrl = String(url).split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  if (fromUrl) return fromUrl[1].toLowerCase();
  const fromType = blob?.type?.split('/')[1];
  return fromType ? fromType.split('+')[0] : 'jpg';
};

const clickLink = (href, filename) => {
  const link = document.createElement('a');
  link.href = href;
  if (filename) link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/**
 * Saves a file instead of opening it. The `download` attribute on a plain link is ignored for
 * files on another site (our Cloudinary images), so the browser just shows the picture.
 * Fetching the file and saving the blob works; if that is blocked, Cloudinary can be asked to
 * send the file as an attachment; as a last resort the file opens in a new tab.
 * @param {string} url - File URL
 * @param {string} name - File name to save as, without extension
 */
export const downloadFile = async (url, name = 'download') => {
  if (!url) return false;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    clickLink(blobUrl, `${safeName(name)}.${extensionOf(url, blob)}`);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return true;
  } catch (error) {
    console.warn('Direct download failed, trying fallback:', error.message);
  }

  if (/res\.cloudinary\.com/.test(url) && url.includes('/upload/')) {
    clickLink(url.replace('/upload/', '/upload/fl_attachment/'), safeName(name));
    return true;
  }

  window.open(url, '_blank', 'noopener');
  return false;
};
