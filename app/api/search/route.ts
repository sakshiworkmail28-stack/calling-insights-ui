import axios from "axios";

export async function POST(request: Request) {
  const { name, company, industry, functionArea } = await request.json();

  const query = [name, company, industry, functionArea]
    .filter(Boolean)
    .join(" ");

  const response = await axios.get("https://serpapi.com/search.json", {
    params: {
      q: query,
      api_key: process.env.SERPAPI_API_KEY,
      num: 5,
    },
  });

  return Response.json(response.data);
}
