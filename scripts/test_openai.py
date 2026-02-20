from research_os.clients.openai_client import get_client


if __name__ == "__main__":
    client = get_client()
    resp = client.responses.create(model="gpt-4.1-mini", input="Reply with exactly: OK")
    print(resp.output_text)
