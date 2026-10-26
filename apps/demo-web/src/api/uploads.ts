import http from "@/utils/http";

export interface UploadPreparation {
  key: string;
  url: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
}

const uploadApi = {
  prepare(file: File): Promise<UploadPreparation | null> {
    return http.post("/api/uploads/presign", {
      name: file.name,
      size: file.size,
      contentType: file.type,
    });
  },
  upload(file: File, preparation: UploadPreparation): Promise<Response | null> {
    return http.putFile(preparation.uploadUrl, preparation.uploadHeaders, file);
  },
};

export default uploadApi;
