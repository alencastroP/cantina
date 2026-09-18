'use client';

import type { BusinessHour, TenantSettings } from '@cantina/contracts';
import { useEffect, useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../components/ui/feedback';
import { Field, Input, Textarea } from '../../../../components/ui/field';
import { Switch } from '../../../../components/ui/switch';
import { api } from '../../../../lib/api';
import { useApi, useMutation } from '../../../../lib/use-api';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * Configurações da loja.
 *
 * O que a vitrine mostra no hero (capa, foto, descrição, endereço e horário)
 * não tinha tela nenhuma antes desta — só existia via API. Três cartões,
 * porque mudam em ritmos diferentes: identidade quase nunca muda, contato
 * ocasionalmente, horário pode mudar toda semana.
 */
export default function ConfiguracoesPage() {
  const settings = useApi<TenantSettings>('/settings');
  const hours = useApi<BusinessHour[]>('/settings/business-hours');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Configurações"
        description="Capa, foto, descrição e horário — o que aparece na vitrine."
      />

      {settings.loading && !settings.data ? (
        <Skeleton className="h-72" />
      ) : settings.data ? (
        <>
          <IdentityCard settings={settings.data} onSaved={settings.reload} />
          <ContactCard settings={settings.data} onSaved={settings.reload} />
        </>
      ) : null}

      {hours.loading && !hours.data ? (
        <Skeleton className="h-72" />
      ) : hours.data ? (
        <HoursCard hours={hours.data} onSaved={hours.reload} />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function IdentityCard({
  settings,
  onSaved,
}: {
  settings: TenantSettings;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const [about, setAbout] = useState(settings.about ?? '');
  const [logoUrl, setLogoUrl] = useState(settings.theme.logoUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(settings.theme.coverUrl ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAbout(settings.about ?? '');
    setLogoUrl(settings.theme.logoUrl ?? '');
    setCoverUrl(settings.theme.coverUrl ?? '');
  }, [settings]);

  const dirty =
    about !== (settings.about ?? '') ||
    logoUrl !== (settings.theme.logoUrl ?? '') ||
    coverUrl !== (settings.theme.coverUrl ?? '');

  async function save() {
    const result = await mutation.run(() =>
      api.put<TenantSettings>('/settings', {
        about: about.trim() || null,
        theme: {
          ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
          ...(coverUrl.trim() ? { coverUrl: coverUrl.trim() } : {}),
        },
      }),
    );
    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    }
  }

  return (
    <Card>
      <CardHeader
        title="Identidade da vitrine"
        description="Capa, foto e descrição que o cliente vê ao abrir a loja."
      />
      <CardBody className="space-y-5">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
        {saved ? <Alert tone="success">Identidade salva.</Alert> : null}

        <Field label="Descrição" hint="Aparece logo abaixo do nome da loja na vitrine.">
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={about}
              onChange={(event) => setAbout(event.target.value)}
              placeholder="Pão quente todo dia às 6h. Encomendas de bolo com 2 dias de antecedência."
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_5rem]">
          <Field
            label="Foto da loja"
            error={mutation.fieldErrors['theme.logoUrl']}
            hint="Cole o link de uma imagem já hospedada (ainda não há upload aqui)."
          >
            {(props) => (
              <Input
                {...props}
                type="url"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://…"
              />
            )}
          </Field>
          <div className="flex items-end justify-center pb-0.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-16 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="grid size-16 place-items-center rounded-full border border-dashed border-border text-center text-[11px] leading-tight text-ink-muted">
                sem foto
              </div>
            )}
          </div>
        </div>

        <Field
          label="Capa"
          error={mutation.fieldErrors['theme.coverUrl']}
          hint="Imagem larga que aparece no topo da vitrine."
        >
          {(props) => (
            <Input
              {...props}
              type="url"
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
              placeholder="https://…"
            />
          )}
        </Field>
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="h-24 w-full rounded-control border border-border object-cover"
          />
        ) : null}

        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={mutation.submitting}
            onClick={() => void save()}
          >
            Salvar identidade
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function ContactCard({
  settings,
  onSaved,
}: {
  settings: TenantSettings;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const [contactPhone, setContactPhone] = useState(settings.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(settings.contactEmail ?? '');
  const [street, setStreet] = useState(settings.address.street ?? '');
  const [number, setNumber] = useState(settings.address.number ?? '');
  const [neighborhood, setNeighborhood] = useState(settings.address.neighborhood ?? '');
  const [city, setCity] = useState(settings.address.city ?? '');
  const [state, setState] = useState(settings.address.state ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setContactPhone(settings.contactPhone ?? '');
    setContactEmail(settings.contactEmail ?? '');
    setStreet(settings.address.street ?? '');
    setNumber(settings.address.number ?? '');
    setNeighborhood(settings.address.neighborhood ?? '');
    setCity(settings.address.city ?? '');
    setState(settings.address.state ?? '');
  }, [settings]);

  async function save() {
    const result = await mutation.run(() =>
      api.put<TenantSettings>('/settings', {
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        address: {
          street: street.trim(),
          number: number.trim(),
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: state.trim(),
        },
      }),
    );
    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    }
  }

  return (
    <Card>
      <CardHeader title="Contato e endereço" description="Onde e como o cliente te encontra." />
      <CardBody className="space-y-5">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
        {saved ? <Alert tone="success">Contato salvo.</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone" error={mutation.fieldErrors['contactPhone']}>
            {(props) => (
              <Input
                {...props}
                type="tel"
                inputMode="tel"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                placeholder="(11) 98765-4321"
              />
            )}
          </Field>
          <Field label="E-mail" error={mutation.fieldErrors['contactEmail']}>
            {(props) => (
              <Input
                {...props}
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <Field label="Rua">
            {(props) => (
              <Input {...props} value={street} onChange={(event) => setStreet(event.target.value)} />
            )}
          </Field>
          <Field label="Número">
            {(props) => (
              <Input {...props} value={number} onChange={(event) => setNumber(event.target.value)} />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_5rem]">
          <Field label="Bairro">
            {(props) => (
              <Input
                {...props}
                value={neighborhood}
                onChange={(event) => setNeighborhood(event.target.value)}
              />
            )}
          </Field>
          <Field label="Cidade">
            {(props) => (
              <Input {...props} value={city} onChange={(event) => setCity(event.target.value)} />
            )}
          </Field>
          <Field label="UF">
            {(props) => (
              <Input
                {...props}
                value={state}
                maxLength={2}
                onChange={(event) => setState(event.target.value.toUpperCase())}
              />
            )}
          </Field>
        </div>

        <div className="flex justify-end">
          <Button
            variant="primary"
            loading={mutation.submitting}
            onClick={() => void save()}
          >
            Salvar contato
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

interface HourRow {
  weekday: number;
  open: boolean;
  opensAt: string;
  closesAt: string;
}

function buildRows(hours: BusinessHour[]): HourRow[] {
  return WEEKDAYS.map((_, weekday) => {
    const existing = hours.find((hour) => hour.weekday === weekday && hour.scope === 'store');
    return {
      weekday,
      open: Boolean(existing),
      opensAt: existing?.opensAt ?? '08:00',
      closesAt: existing?.closesAt ?? '18:00',
    };
  });
}

function HoursCard({
  hours: initial,
  onSaved,
}: {
  hours: BusinessHour[];
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const [rows, setRows] = useState(() => buildRows(initial));
  const [saved, setSaved] = useState(false);

  useEffect(() => setRows(buildRows(initial)), [initial]);

  function updateRow(index: number, patch: Partial<HourRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    // Substituição integral (§ contrato): preserva horas de outro `scope`
    // (encomenda) que esta tela não edita, e troca só as de `scope: 'store'`.
    const otherScopes = initial.filter((hour) => hour.scope !== 'store');
    const storeHours = rows
      .filter((row) => row.open)
      .map((row) => ({
        weekday: row.weekday,
        opensAt: row.opensAt,
        closesAt: row.closesAt,
        scope: 'store' as const,
      }));

    const result = await mutation.run(() =>
      api.put('/settings/business-hours', { hours: [...storeHours, ...otherScopes] }),
    );
    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    }
  }

  return (
    <Card>
      <CardHeader
        title="Horário de funcionamento"
        description="Quando a loja aparece como aberta na vitrine."
      />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
        {saved ? <Alert tone="success">Horário salvo.</Alert> : null}

        <ul className="divide-y divide-border">
          {rows.map((row, index) => (
            <li key={row.weekday} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
              <Switch
                label={WEEKDAYS[row.weekday]!}
                checked={row.open}
                onCheckedChange={(checked) => updateRow(index, { open: checked })}
                className="w-32 shrink-0"
              />
              {row.open ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    controlSize="sm"
                    value={row.opensAt}
                    onChange={(event) => updateRow(index, { opensAt: event.target.value })}
                    className="w-28"
                  />
                  <span className="text-sm text-ink-muted">até</span>
                  <Input
                    type="time"
                    controlSize="sm"
                    value={row.closesAt}
                    onChange={(event) => updateRow(index, { closesAt: event.target.value })}
                    className="w-28"
                  />
                </div>
              ) : (
                <span className="text-sm text-ink-muted">Fechado</span>
              )}
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <Button variant="primary" loading={mutation.submitting} onClick={() => void save()}>
            Salvar horário
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
