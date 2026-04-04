import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const email = body?.email?.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Por favor, introduza um email válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = import.meta.env.RESEND_API_KEY;
    const segmentId = import.meta.env.RESEND_SEGMENT_ID;

    if (!apiKey || !segmentId) {
      console.error('Missing RESEND_API_KEY or RESEND_SEGMENT_ID');
      return new Response(
        JSON.stringify({ message: 'Obrigado! A sua subscrição foi registada.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    await resend.contacts.create({
      email,
      segments: [segmentId],
    });

    return new Response(
      JSON.stringify({ message: 'Subscrito com sucesso! Verifique o seu email.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Subscribe error:', error);
    return new Response(
      JSON.stringify({ error: 'Ocorreu um erro. Tente novamente mais tarde.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
