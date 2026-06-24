import FormData from 'form-data';
import { Axios } from 'axios';

export class GotenbergUtils {
  public static assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
      throw new Error(message);
    }
  }

  public static async fetch(endpoint: string, data: FormData): Promise<Buffer> {
    if (!endpoint || endpoint.startsWith('/')) {
      throw new Error(
        'PDF service is not configured. Set the GOTENBERG_URL environment variable.',
      );
    }
    const response = await new Axios({
      headers: { ...data.getHeaders() },
      responseType: 'arraybuffer',
    }).post(endpoint, data);

    if (response.status !== 200) {
      throw new Error(
        `Gotenberg returned HTTP ${response.status}. Check that the PDF service is running at ${endpoint}.`,
      );
    }
    return response.data;
  }
}
