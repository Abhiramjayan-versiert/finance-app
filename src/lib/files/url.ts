/** URL for one of the signed-in user's private files ("{uid}/{fileId}" path). */
export const fileUrl = (path: string) => `/api/files/${encodeURIComponent(path.split("/")[1] ?? "")}`;
