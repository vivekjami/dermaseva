// Shrink the captured image to a 100x100 JPEG base64 thumbnail for history storage.
// The full-resolution image is deleted after this runs (build spec Step 3.3).

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

export async function makeThumbnail(imageUri: string): Promise<string | null> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 100, height: 100 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result.base64 ?? null;
  } catch (e) {
    console.warn('[Thumbnail] Failed to create thumbnail:', e);
    return null;
  }
}

export async function deleteOriginal(imageUri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(imageUri);
    if (info.exists) {
      await FileSystem.deleteAsync(imageUri, { idempotent: true });
    }
  } catch (e) {
    console.warn('[Thumbnail] Failed to delete original image:', e);
  }
}
