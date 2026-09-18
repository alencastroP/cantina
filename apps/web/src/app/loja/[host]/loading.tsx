/**
 * Enquanto a próxima página da vitrine vem do servidor.
 *
 * A casca (capa, cartões de modo) fica parada — só o conteúdo troca por este
 * esqueleto. Com ele, o toque em "Encomendar" responde na hora, em vez de a
 * tela congelar até o cardápio chegar.
 */
export default function LojaLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="space-y-6">
      <div className="shimmer h-7 w-36 rounded-full" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex gap-3.5">
          <div className="shimmer size-[5.5rem] shrink-0 rounded-[1.35rem]" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="shimmer h-4 w-2/3 rounded-full" />
            <div className="shimmer h-3 w-full rounded-full" />
            <div className="shimmer h-3 w-1/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
