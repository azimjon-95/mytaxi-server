import axios from "axios";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();

type ImgBBResponse = {
    data: {
        data: {
            url: string;
        };
    };
};

const uploadToImgBB = async (buffer: Buffer): Promise<string> => {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
        throw new Error("IMGBB_API_KEY env topilmadi (.env ni tekshiring)");
    }

    const formData = new FormData();
    formData.append("image", buffer.toString("base64"));

    const resp = await axios.post<any, ImgBBResponse>(
        `https://api.imgbb.com/1/upload?key=${apiKey}`,
        formData,
        { headers: formData.getHeaders() }
    );

    const url = resp?.data?.data?.url;
    if (!url) {
        throw new Error("ImgBB response ichida url topilmadi");
    }

    return url;
};

export = uploadToImgBB;
