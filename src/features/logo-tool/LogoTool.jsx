import {
  useEffect,
  useState,
} from 'react'

import {
  PDFDocument,
  StandardFonts,
  rgb,
} from 'pdf-lib'

import * as pdfjsLib from 'pdfjs-dist'

import pdfWorker from
  'pdfjs-dist/build/pdf.worker.min.mjs?url'


/* ==================================================
   PDF.JS
================================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  pdfWorker


/* ==================================================
   SAVED BRAND PROFILES
================================================== */

const STORAGE_KEY =
  'sardines-brand-profiles-v3'

const BRAND_METADATA_PREFIX =
  'SardinesBrand:'


const DEFAULT_PROFILES = {
  ctd: {
    label: 'CTD',

    logoDataUrl: '',
    logoName: '',

    address1:
      '13416 Watertown Plank Rd STE 200',

    address2:
      'Elm Grove, WI 53122',

    phone:
      '(855) 744-8747',
  },

  sunrise: {
    label: 'Sunrise',

    logoDataUrl: '',
    logoName: '',

    address1:
      '12166 Old Big Bend Road #99',

    address2:
      'Kirkwood, MO 63122 US',

    phone:
      '(314) 394-3081',
  },
}


/* ==================================================
   LOGO OPTICAL SIZING
================================================== */

const LOGO_LAYOUT = {
  ctd: {
    singleWidth: 145,
    singleHeight: 66,

    addedWidth: 138,
    addedHeight: 64,
  },

  sunrise: {
    singleWidth: 125,
    singleHeight: 54,

    addedWidth: 82,
    addedHeight: 40,
  },
}


/* ==================================================
   BASIC HELPERS
================================================== */

function brandLabel(
  brand
) {
  if (brand === 'ctd') {
    return 'CTD'
  }

  if (
    brand === 'sunrise'
  ) {
    return 'Sunrise'
  }

  return ''
}


function otherBrand(
  brand
) {
  if (brand === 'ctd') {
    return 'sunrise'
  }

  if (
    brand === 'sunrise'
  ) {
    return 'ctd'
  }

  return ''
}


function sleep(
  milliseconds
) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds
      )
  )
}


function cleanOutputBaseName(
  fileName
) {
  return String(
    fileName ?? ''
  )
    .replace(
      /\.pdf$/i,
      ''
    )
    .replace(
      /_(CTD_SUN|SUN_CTD|CTD|SUN)(?:\(\d+\))?$/i,
      ''
    )
}


/* ==================================================
   FILE HELPERS
================================================== */

function isPdf(
  file
) {
  return (
    file?.type ===
      'application/pdf' ||
    file?.name
      ?.toLowerCase()
      .endsWith('.pdf')
  )
}


function isSupportedLogo(
  file
) {
  if (!file) {
    return false
  }

  return (
    file.type ===
      'image/png' ||
    file.type ===
      'image/jpeg' ||
    /\.(png|jpe?g)$/i.test(
      file.name
    )
  )
}


function readFileAsDataUrl(
  file
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const reader =
        new FileReader()

      reader.onload = () =>
        resolve(
          reader.result
        )

      reader.onerror =
        reject

      reader.readAsDataURL(
        file
      )
    }
  )
}


function dataUrlToBytes(
  dataUrl
) {
  const base64 =
    dataUrl.split(',')[1]

  const binary =
    atob(base64)

  const bytes =
    new Uint8Array(
      binary.length
    )

  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    bytes[index] =
      binary.charCodeAt(
        index
      )
  }

  return bytes
}


/* ==================================================
   IMAGE HELPERS
================================================== */

function fitImage(
  image,
  maxWidth,
  maxHeight
) {
  const scale =
    Math.min(
      maxWidth /
        image.width,

      maxHeight /
        image.height
    )

  return {
    width:
      image.width *
      scale,

    height:
      image.height *
      scale,
  }
}


async function embedLogo(
  pdfDoc,
  profile
) {
  if (
    !profile
      ?.logoDataUrl
  ) {
    throw new Error(
      `${profile?.label ?? 'Brand'} logo is missing.`
    )
  }

  const bytes =
    dataUrlToBytes(
      profile.logoDataUrl
    )

  if (
    profile.logoDataUrl
      .startsWith(
        'data:image/png'
      )
  ) {
    return pdfDoc.embedPng(
      bytes
    )
  }

  return pdfDoc.embedJpg(
    bytes
  )
}


/* ==================================================
   ADDRESS DRAWING
================================================== */

function drawAddressBlock({
  page,
  font,
  profile,
  x,
  top,
  width,
  fontSize = 7.6,
}) {
  const {
    height,
  } =
    page.getSize()

  const lines = [
    profile.address1,
    profile.address2,
    profile.phone,
  ].filter(Boolean)

  const lineHeight =
    fontSize *
    1.52

  lines.forEach(
    (
      line,
      index
    ) => {
      const textWidth =
        font.widthOfTextAtSize(
          line,
          fontSize
        )

      page.drawText(
        line,
        {
          x:
            x +
            width -
            textWidth,

          y:
            height -
            top -
            fontSize -
            index *
              lineHeight,

          size:
            fontSize,

          font,

          color:
            rgb(
              0.27,
              0.3,
              0.31
            ),
        }
      )
    }
  )
}


/* ==================================================
   CLEAR HEADER AREAS
================================================== */

function clearLogoArea(
  page
) {
  const {
    height,
  } =
    page.getSize()

  page.drawRectangle({
    x: 18,

    y:
      height -
      72,

    width: 270,

    height: 68,

    color:
      rgb(
        1,
        1,
        1
      ),
  })
}


function clearAddressArea(
  page
) {
  const {
    width,
    height,
  } =
    page.getSize()

  page.drawRectangle({
    x:
      width -
      290,

    y:
      height -
      68,

    width: 275,

    height: 63,

    color:
      rgb(
        1,
        1,
        1
      ),
  })
}


/* ==================================================
   SINGLE BRAND
================================================== */

function drawSingleBrand({
  page,
  font,
  brand,
  profile,
  image,
}) {
  const {
    width,
    height,
  } =
    page.getSize()

  const layout =
    LOGO_LAYOUT[
      brand
    ]

  const fitted =
    fitImage(
      image,
      layout.singleWidth,
      layout.singleHeight
    )

  page.drawImage(
    image,
    {
      x: 25,

      y:
        height -
        11 -
        fitted.height,

      width:
        fitted.width,

      height:
        fitted.height,
    }
  )

  drawAddressBlock({
    page,
    font,
    profile,

    x:
      width -
      145,

    top: 17,

    width: 115,

    fontSize: 7.6,
  })
}


/* ==================================================
   ADD SECOND BRAND

   Existing logo remains on the PDF.
   New logo is added beside it.

   Logos = left.
   Addresses = right.
================================================== */

function drawAddedBrand({
  page,
  font,

  currentBrand,
  currentProfile,

  addedBrand,
  addedProfile,
  addedImage,
}) {
  const {
    width,
    height,
  } =
    page.getSize()

  const layout =
    LOGO_LAYOUT[
      addedBrand
    ]


  /* --------------------------------------------------
     SECOND LOGO POSITION
  -------------------------------------------------- */

  let x = 165

  /*
   * Smaller top number =
   * farther UP the page.
   */

  let top = 6


  /*
   * Sunrise already on page,
   * CTD is being added.
   */

  if (
    currentBrand ===
      'sunrise' &&
    addedBrand ===
      'ctd'
  ) {
    x = 178

    /*
     * This is the CTD vertical
     * adjustment we've been tweaking.
     */
    top = 5
  }


  /*
   * CTD already on page,
   * Sunrise is being added.
   */

  if (
    currentBrand ===
      'ctd' &&
    addedBrand ===
      'sunrise'
  ) {
    x = 155
    top = 10
  }


  const fitted =
    fitImage(
      addedImage,
      layout.addedWidth,
      layout.addedHeight
    )

  page.drawImage(
    addedImage,
    {
      x,

      y:
        height -
        top -
        fitted.height,

      width:
        fitted.width,

      height:
        fitted.height,
    }
  )


  /* --------------------------------------------------
     ADDRESSES
  -------------------------------------------------- */

  clearAddressArea(
    page
  )

  const addressX =
    width -
    285

  const blockWidth =
    125

  const gap =
    10


  /*
   * Existing address first.
   */

  drawAddressBlock({
    page,
    font,

    profile:
      currentProfile,

    x:
      addressX,

    top: 17,

    width:
      blockWidth,

    fontSize: 7.1,
  })


  /*
   * Added address second.
   */

  drawAddressBlock({
    page,
    font,

    profile:
      addedProfile,

    x:
      addressX +
      blockWidth +
      gap,

    top: 17,

    width:
      blockWidth,

    fontSize: 7.1,
  })
}


/* ==================================================
   APPLY BRANDING

   IMPORTANT:
   Preview and downloaded PDF both use this.
================================================== */

async function applyBranding({
  pdfDoc,
  currentBrand,
  action,
  profiles,
}) {
  const replacementBrand =
    otherBrand(
      currentBrand
    )

  if (
    !replacementBrand
  ) {
    throw new Error(
      'Current label must be CTD or Sunrise.'
    )
  }

  const currentProfile =
    profiles[
      currentBrand
    ]

  const replacementProfile =
    profiles[
      replacementBrand
    ]

  const font =
    await pdfDoc.embedFont(
      StandardFonts
        .Helvetica
    )

  const replacementImage =
    await embedLogo(
      pdfDoc,
      replacementProfile
    )

  const pages =
    pdfDoc.getPages()


  /* ==================================================
     RELABEL
  ================================================== */

  if (
    action ===
    'relabel'
  ) {
    pages.forEach(
      (page) => {
        clearLogoArea(
          page
        )

        clearAddressArea(
          page
        )

        drawSingleBrand({
          page,
          font,

          brand:
            replacementBrand,

          profile:
            replacementProfile,

          image:
            replacementImage,
        })
      }
    )

    pdfDoc.setSubject(
      `${BRAND_METADATA_PREFIX}${replacementBrand}`
    )

    return
  }


  /* ==================================================
     ADD LABEL
  ================================================== */

  if (
    action ===
    'add'
  ) {
    pages.forEach(
      (page) => {
        drawAddedBrand({
          page,
          font,

          currentBrand,

          currentProfile,

          addedBrand:
            replacementBrand,

          addedProfile:
            replacementProfile,

          addedImage:
            replacementImage,
        })
      }
    )

    pdfDoc.setSubject(
      `${BRAND_METADATA_PREFIX}both`
    )

    return
  }

  throw new Error(
    'Unknown labeling operation.'
  )
}


/* ==================================================
   RENDER ACTUAL RESULT FOR PREVIEW
================================================== */

async function renderHeaderPreview(
  pdfBytes
) {
  const data =
    new Uint8Array(
      pdfBytes
    )

  const loadingTask =
    pdfjsLib.getDocument({
      data,
    })

  const pdf =
    await loadingTask.promise

  const page =
    await pdf.getPage(1)

  const scale =
    2

  const viewport =
    page.getViewport({
      scale,
    })

  const pageCanvas =
    document.createElement(
      'canvas'
    )

  pageCanvas.width =
    Math.ceil(
      viewport.width
    )

  pageCanvas.height =
    Math.ceil(
      viewport.height
    )

  const pageContext =
    pageCanvas.getContext(
      '2d'
    )

  if (
    !pageContext
  ) {
    throw new Error(
      'Could not create PDF preview canvas.'
    )
  }

  await page.render({
    canvasContext:
      pageContext,

    viewport,
  }).promise


  /* --------------------------------------------------
     CROP HEADER
  -------------------------------------------------- */

  const cropHeight =
    Math.min(
      pageCanvas.height,

      Math.round(
        82 *
        scale
      )
    )

  const cropCanvas =
    document.createElement(
      'canvas'
    )

  cropCanvas.width =
    pageCanvas.width

  cropCanvas.height =
    cropHeight

  const cropContext =
    cropCanvas.getContext(
      '2d'
    )

  if (
    !cropContext
  ) {
    throw new Error(
      'Could not create header preview canvas.'
    )
  }

  cropContext.fillStyle =
    '#ffffff'

  cropContext.fillRect(
    0,
    0,
    cropCanvas.width,
    cropCanvas.height
  )

  cropContext.drawImage(
    pageCanvas,

    0,
    0,

    pageCanvas.width,
    cropHeight,

    0,
    0,

    cropCanvas.width,
    cropHeight
  )

  return cropCanvas.toDataURL(
    'image/png'
  )
}


/* ==================================================
   CREATE TEMPORARY PDF FOR PREVIEW
================================================== */

async function createPreview({
  file,
  currentBrand,
  action,
  profiles,
}) {
  const source =
    await file.arrayBuffer()

  const pdfDoc =
    await PDFDocument.load(
      source
    )

  await applyBranding({
    pdfDoc,
    currentBrand,
    action,
    profiles,
  })

  const result =
    await pdfDoc.save()

  return renderHeaderPreview(
    result
  )
}


/* ==================================================
   REPLACEMENT LABEL ROW
================================================== */

function ReplacementLabel({
  profile,
  onChange,
}) {
  async function handleLogo(
    file
  ) {
    if (
      !file ||
      !isSupportedLogo(
        file
      )
    ) {
      return
    }

    const dataUrl =
      await readFileAsDataUrl(
        file
      )

    onChange({
      ...profile,

      logoDataUrl:
        dataUrl,

      logoName:
        file.name,
    })
  }


  function update(
    field,
    value
  ) {
    onChange({
      ...profile,

      [field]:
        value,
    })
  }


  return (
    <div className="relabel-new-label">
      <div className="relabel-new-label-main">
        <span className="relabel-row-label">
          New Label
        </span>

        <strong className="relabel-new-brand">
          {profile.label}
        </strong>

        {profile.logoName ? (
          <span className="relabel-logo-filename">
            {profile.logoName}
          </span>
        ) : (
          <span className="relabel-logo-missing">
            Logo needed
          </span>
        )}

        <label className="secondary-button">
          {profile.logoDataUrl
            ? 'Change Logo'
            : 'Choose Logo'}

          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(
              event
            ) =>
              handleLogo(
                event.target
                  .files?.[0]
              )
            }
          />
        </label>
      </div>


      <details className="relabel-details">
        <summary>
          Address / phone
        </summary>

        <div className="brand-address-fields">
          <input
            type="text"
            value={
              profile.address1
            }
            placeholder="Address line 1"
            onChange={(
              event
            ) =>
              update(
                'address1',
                event.target.value
              )
            }
          />

          <input
            type="text"
            value={
              profile.address2
            }
            placeholder="Address line 2"
            onChange={(
              event
            ) =>
              update(
                'address2',
                event.target.value
              )
            }
          />

          <input
            type="text"
            value={
              profile.phone
            }
            placeholder="Phone"
            onChange={(
              event
            ) =>
              update(
                'phone',
                event.target.value
              )
            }
          />
        </div>
      </details>
    </div>
  )
}


/* ==================================================
   VINTAGE TIN ANIMATION
================================================== */

const TIN_ANIMATION_CSS = `
  .sardines-labeling-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;

    display: grid;
    place-items: center;

    background:
      rgba(25, 34, 31, 0.34);

    backdrop-filter:
      blur(2px);

    animation:
      sardinesOverlayIn 160ms ease-out both;
  }

  .sardines-labeling-scene {
    position: relative;

    width: 420px;
    max-width:
      calc(100vw - 30px);

    height: 270px;
  }

  .sardines-animation-tin {
    position: absolute;

    left: 50%;
    top: 50%;

    width: 330px;
    height: 190px;

    transform:
      translate(-50%, -44%)
      rotate(-2deg);

    border:
      5px solid #51482f;

    border-radius:
      24px;

    background:
      linear-gradient(
        90deg,
        rgba(255,255,255,0.16),
        transparent 12%,
        transparent 88%,
        rgba(55,45,24,0.12)
      ),
      linear-gradient(
        180deg,
        #d9c165 0%,
        #d2b44d 52%,
        #c4a23d 100%
      );

    box-shadow:
      inset 0 0 0 3px
        #efe0a0,
      inset 0 0 0 7px
        #8a763d,
      0 15px 30px
        rgba(24, 28, 24, 0.28);

    overflow: hidden;

    animation:
      sardinesTinArrive
      440ms
      cubic-bezier(.2,.9,.3,1.12)
      both;
  }

  .sardines-animation-tin::before {
    content: "";

    position: absolute;
    inset: 11px;

    border:
      2px solid
      rgba(77, 57, 21, 0.55);

    border-radius:
      15px;

    pointer-events: none;
  }

  .sardines-animation-stripe {
    position: absolute;

    left: -15px;
    right: -15px;
    top: 25px;

    height: 26px;

    background:
      #a9322d;

    transform:
      rotate(-3deg);

    box-shadow:
      0 2px 0
        rgba(74, 35, 23, 0.25);
  }

  .sardines-animation-brand {
    position: absolute;

    inset: 54px 28px auto;

    text-align: center;

    color: #173d3b;

    font-family:
      Georgia,
      "Times New Roman",
      serif;
  }

  .sardines-animation-brand .lost-charter {
    display: block;

    margin-bottom: 1px;

    color: #8f2a27;

    font-size: 17px;
    font-weight: 900;

    letter-spacing: .13em;

    text-transform: uppercase;
  }

  .sardines-animation-brand .sardines-word {
    display: block;

    font-size: 47px;
    font-weight: 900;

    line-height: .95;

    letter-spacing: -.05em;

    text-shadow:
      2px 2px 0
      rgba(255, 246, 202, .65);
  }

  .sardines-animation-brand .protocol {
    display: block;

    margin-top: 7px;

    color: #4e5f59;

    font-size: 12px;
    font-style: italic;

    letter-spacing: .04em;
  }

  .sardines-animation-fish {
    position: absolute;

    left: 38px;
    bottom: 22px;

    color:
      rgba(28, 73, 70, 0.78);

    font-size: 27px;

    transform:
      rotate(4deg);
  }

  .sardines-animation-label {
    position: absolute;

    z-index: 4;

    left: 50%;
    top: 50%;

    min-width: 185px;

    padding: 14px 23px;

    border:
      2px solid #8c2c28;

    background:
      #fff8df;

    color:
      #8c2c28;

    font-family:
      Georgia,
      "Times New Roman",
      serif;

    font-size: 22px;
    font-weight: 900;

    letter-spacing: .05em;

    text-align: center;
    text-transform: uppercase;

    box-shadow:
      2px 4px 7px
      rgba(38, 34, 24, .28);

    transform:
      translate(110%, -160%)
      rotate(11deg);

    opacity: 0;

    animation:
      sardinesLabelSlap
      560ms
      390ms
      cubic-bezier(.18,.95,.35,1.15)
      forwards;
  }

  .sardines-animation-label::after {
    content: "";

    position: absolute;
    inset: 4px;

    border:
      1px dashed
      rgba(140,44,40,.48);

    pointer-events: none;
  }

  .sardines-animation-caption {
    position: absolute;

    left: 0;
    right: 0;
    bottom: 2px;

    color: #fff9e7;

    font-family:
      Georgia,
      "Times New Roman",
      serif;

    font-size: 15px;
    font-style: italic;

    text-align: center;

    text-shadow:
      0 2px 3px
      rgba(0,0,0,.35);

    opacity: 0;

    animation:
      sardinesCaptionIn
      220ms
      850ms
      ease-out
      forwards;
  }

  @keyframes sardinesOverlayIn {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes sardinesTinArrive {
    from {
      opacity: 0;

      transform:
        translate(-50%, 35%)
        rotate(-9deg)
        scale(.82);
    }

    to {
      opacity: 1;

      transform:
        translate(-50%, -44%)
        rotate(-2deg)
        scale(1);
    }
  }

  @keyframes sardinesLabelSlap {
    0% {
      opacity: 0;

      transform:
        translate(110%, -160%)
        rotate(11deg)
        scale(1.15);
    }

    62% {
      opacity: 1;

      transform:
        translate(-47%, -38%)
        rotate(-5deg)
        scale(.93);
    }

    78% {
      transform:
        translate(-50%, -40%)
        rotate(-3deg)
        scale(1.05);
    }

    100% {
      opacity: 1;

      transform:
        translate(-50%, -40%)
        rotate(-4deg)
        scale(1);
    }
  }

  @keyframes sardinesCaptionIn {
    from {
      opacity: 0;
      transform:
        translateY(5px);
    }

    to {
      opacity: 1;
      transform:
        translateY(0);
    }
  }

  @media (
    prefers-reduced-motion:
    reduce
  ) {
    .sardines-animation-tin,
    .sardines-animation-label,
    .sardines-labeling-overlay,
    .sardines-animation-caption {
      animation-duration:
        1ms !important;

      animation-delay:
        0ms !important;
    }
  }
`


function LabelingAnimation({
  action,
  currentBrand,
  replacementBrand,
}) {
  const stickerText =
    action === 'add'
      ? `${brandLabel(currentBrand)} + ${brandLabel(replacementBrand)}`
      : brandLabel(
          replacementBrand
        )

  return (
    <div
      className="sardines-labeling-overlay"
      role="status"
      aria-live="polite"
      aria-label="Relabeling sardine tin"
    >
      <style>
        {TIN_ANIMATION_CSS}
      </style>

      <div className="sardines-labeling-scene">
        <div className="sardines-animation-tin">
          <div className="sardines-animation-stripe" />

          <div className="sardines-animation-brand">
            <span className="lost-charter">
              Lost Charter
            </span>

            <span className="sardines-word">
              Sardines
            </span>

            <span className="protocol">
              Passenger Packing Protocol
            </span>
          </div>

          <div className="sardines-animation-fish">
            ◀≋≋
          </div>
        </div>

        <div className="sardines-animation-label">
          {stickerText}
        </div>

        <div className="sardines-animation-caption">
          Slapping on the new label...
        </div>
      </div>
    </div>
  )
}


/* ==================================================
   RELABEL THE TIN
================================================== */

function LogoTool() {
  const [
    pdfFile,
    setPdfFile,
  ] =
    useState(null)

  const [
    currentBrand,
    setCurrentBrand,
  ] =
    useState('')

  const [
    action,
    setAction,
  ] =
    useState(
      'relabel'
    )

  const [
    profiles,
    setProfiles,
  ] =
    useState(
      () => {
        try {
          const saved =
            localStorage.getItem(
              STORAGE_KEY
            )

          if (!saved) {
            return DEFAULT_PROFILES
          }

          const parsed =
            JSON.parse(saved)

          return {
            ctd: {
              ...DEFAULT_PROFILES.ctd,
              ...(parsed.ctd ?? {}),
            },
            sunrise: {
              ...DEFAULT_PROFILES.sunrise,
              ...(parsed.sunrise ?? {}),
            },
          }
        } catch (error) {
          console.warn(
            'Could not load saved labels.',
            error
          )
          return DEFAULT_PROFILES
        }
      }
    )

  const [
    preview,
    setPreview,
  ] =
    useState('')

  const [
    previewStatus,
    setPreviewStatus,
  ] =
    useState('idle')

  const [
    previewError,
    setPreviewError,
  ] =
    useState('')

  const [
    processing,
    setProcessing,
  ] =
    useState(false)

  const [
    animating,
    setAnimating,
  ] =
    useState(false)

  const [
    message,
    setMessage,
  ] =
    useState('')


  /* ==================================================
     SAVE LABELS
  ================================================== */

  useEffect(
    () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,

          JSON.stringify(
            profiles
          )
        )
      } catch (error) {
        console.warn(
          'Could not save labels.',
          error
        )
      }
    },
    [profiles]
  )


  /* ==================================================
     DERIVED BRAND STATE
  ================================================== */

  const replacementBrand =
    otherBrand(
      currentBrand
    )

  const replacementProfile =
    replacementBrand
      ? profiles[
          replacementBrand
        ]
      : null


  /* ==================================================
     UPDATE PROFILE
  ================================================== */

  function updateProfile(
    brand,
    value
  ) {
    setProfiles(
      (
        current
      ) => ({
        ...current,

        [brand]:
          value,
      })
    )
  }


  /* ==================================================
     PDF SELECTION
  ================================================== */

  function handlePdf(
    file
  ) {
    setMessage('')
    setPreview('')
    setPreviewError('')

    setPreviewStatus(
      'idle'
    )

    if (!file) {
      setPdfFile(null)

      return
    }

    if (
      !isPdf(
        file
      )
    ) {
      setMessage(
        "That's not a PDF."
      )

      return
    }

    setPdfFile(
      file
    )
  }


  /* ==================================================
     FINAL HEADER PREVIEW

     RELABEL and ADD LABEL both pass through
     the exact same PDF-writing system used
     by the final download.
  ================================================== */

  useEffect(
    () => {
      let cancelled =
        false

      async function build() {
        setPreview('')
        setPreviewError('')

        if (!pdfFile) {
          setPreviewStatus(
            'idle'
          )

          return
        }

        if (
          ![
            'ctd',
            'sunrise',
          ].includes(
            currentBrand
          )
        ) {
          setPreviewStatus(
            'waiting'
          )

          return
        }

        if (
          !replacementProfile
            ?.logoDataUrl
        ) {
          setPreviewStatus(
            'waiting'
          )

          return
        }

        setPreviewStatus(
          'building'
        )

        try {
          const result =
            await createPreview({
              file:
                pdfFile,

              currentBrand,

              action,

              profiles,
            })

          if (
            cancelled
          ) {
            return
          }

          setPreview(
            result
          )

          setPreviewStatus(
            'ready'
          )
        } catch (error) {
          console.error(
            'Sardines preview error:',
            error
          )

          if (
            cancelled
          ) {
            return
          }

          setPreview('')

          setPreviewError(
            error?.message ||
            'Unknown preview error.'
          )

          setPreviewStatus(
            'error'
          )
        }
      }

      build()

      return () => {
        cancelled =
          true
      }
    },
    [
      profiles,

      pdfFile,

      currentBrand,

      action,

      replacementBrand,

      replacementProfile
        ?.logoDataUrl,

      replacementProfile
        ?.address1,

      replacementProfile
        ?.address2,

      replacementProfile
        ?.phone,

      profiles.ctd
        .address1,

      profiles.ctd
        .address2,

      profiles.ctd
        .phone,

      profiles.sunrise
        .address1,

      profiles.sunrise
        .address2,

      profiles.sunrise
        .phone,
    ]
  )


  /* ==================================================
     CREATE FINAL PDF
  ================================================== */

  async function createPdf() {
    setMessage('')

    if (!pdfFile) {
      setMessage(
        'Choose a PDF first.'
      )

      return
    }

    if (
      ![
        'ctd',
        'sunrise',
      ].includes(
        currentBrand
      )
    ) {
      setMessage(
        'Select the current label first.'
      )

      return
    }

    if (
      !replacementProfile
        ?.logoDataUrl
    ) {
      setMessage(
        `${brandLabel(replacementBrand)} needs a logo.`
      )

      return
    }

    setProcessing(
      true
    )

    try {
      const source =
        await pdfFile.arrayBuffer()

      const pdfDoc =
        await PDFDocument.load(
          source
        )

      await applyBranding({
        pdfDoc,
        currentBrand,
        action,
        profiles,
      })

      const output =
        await pdfDoc.save()

      const blob =
        new Blob(
          [
            output,
          ],
          {
            type:
              'application/pdf',
          }
        )

      const url =
        URL.createObjectURL(
          blob
        )

      const originalName =
        cleanOutputBaseName(
          pdfFile.name
        )

      const suffix =
        action === 'add'
          ? 'CTD_SUN'
          : replacementBrand ===
              'ctd'
            ? 'CTD'
            : 'SUN'


      /* --------------------------------------------------
         PLAY THE TIN ANIMATION FIRST
      -------------------------------------------------- */

      setAnimating(
        true
      )

      await sleep(
        1700
      )


      /* --------------------------------------------------
         THEN OPEN DOWNLOAD / SAVE
      -------------------------------------------------- */

      const link =
        document.createElement(
          'a'
        )

      link.href =
        url

      link.download =
        `${originalName}_${suffix}.pdf`

      document.body.appendChild(
        link
      )

      link.click()

      link.remove()

      setAnimating(
        false
      )

      /*
       * Give the browser a moment
       * before revoking the URL.
       */

      setTimeout(
        () => {
          URL.revokeObjectURL(
            url
          )
        },
        1000
      )

      setMessage(
        action === 'add'
          ? `✓ ${brandLabel(replacementBrand)} added.`
          : `✓ Relabeled to ${brandLabel(replacementBrand)}.`
      )
    } catch (error) {
      console.error(
        error
      )

      setAnimating(
        false
      )

      setMessage(
        'Sardines could not relabel that PDF.'
      )
    } finally {
      setProcessing(
        false
      )
    }
  }


  /* ==================================================
     UI
  ================================================== */

  return (
    <section className="logo-tool">
      {animating && (
        <LabelingAnimation
          action={
            action
          }
          currentBrand={
            currentBrand
          }
          replacementBrand={
            replacementBrand
          }
        />
      )}


      {/* ==================================================
          HEADING
      ================================================== */}

      <header className="logo-tool-heading">
        <h2>
          Relabel the Tin
        </h2>

        <p>
          Swap the label without
          repacking the sardines.
        </p>
      </header>


      {/* ==================================================
          PDF
      ================================================== */}

      <div className="relabel-pdf-row">
        <span className="relabel-row-label">
          Ticket PDF
        </span>

        {pdfFile ? (
          <>
            <span className="relabel-pdf-name">
              ✓ {pdfFile.name}
            </span>

            <label className="secondary-button">
              Change

              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(
                  event
                ) =>
                  handlePdf(
                    event.target
                      .files?.[0]
                  )
                }
              />
            </label>
          </>
        ) : (
          <label className="file-picker">
            Choose PDF

            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(
                event
              ) =>
                handlePdf(
                  event.target
                    .files?.[0]
                )
              }
            />
          </label>
        )}
      </div>


      {/* ==================================================
          CURRENT LABEL
      ================================================== */}

      {pdfFile && (
        <fieldset className="relabel-radio-group">
          <legend>
            Current Label
          </legend>

          <label>
            <input
              type="radio"
              name="current-brand"
              value="ctd"
              checked={
                currentBrand ===
                'ctd'
              }
              onChange={() =>
                setCurrentBrand(
                  'ctd'
                )
              }
            />

            <span className="relabel-radio" />

            CTD
          </label>

          <label>
            <input
              type="radio"
              name="current-brand"
              value="sunrise"
              checked={
                currentBrand ===
                'sunrise'
              }
              onChange={() =>
                setCurrentBrand(
                  'sunrise'
                )
              }
            />

            <span className="relabel-radio" />

            Sunrise
          </label>
        </fieldset>
      )}


      {/* ==================================================
          OPERATION
      ================================================== */}

      {replacementProfile && (
        <fieldset className="relabel-radio-group operation">
          <legend>
            What are we doing?
          </legend>

          <label>
            <input
              type="radio"
              name="label-operation"
              value="relabel"
              checked={
                action ===
                'relabel'
              }
              onChange={() =>
                setAction(
                  'relabel'
                )
              }
            />

            <span className="relabel-radio" />

            <span>
              <strong>
                Relabel
              </strong>

              <small>
                Replace{' '}
                {brandLabel(
                  currentBrand
                )}{' '}
                with{' '}
                {brandLabel(
                  replacementBrand
                )}
              </small>
            </span>
          </label>

          <label>
            <input
              type="radio"
              name="label-operation"
              value="add"
              checked={
                action ===
                'add'
              }
              onChange={() =>
                setAction(
                  'add'
                )
              }
            />

            <span className="relabel-radio" />

            <span>
              <strong>
                Add Label
              </strong>

              <small>
                Keep{' '}
                {brandLabel(
                  currentBrand
                )}{' '}
                and add{' '}
                {brandLabel(
                  replacementBrand
                )}
              </small>
            </span>
          </label>
        </fieldset>
      )}


      {/* ==================================================
          NEW LABEL
      ================================================== */}

      {replacementProfile && (
        <ReplacementLabel
          profile={
            replacementProfile
          }
          onChange={(
            value
          ) =>
            updateProfile(
              replacementBrand,
              value
            )
          }
        />
      )}


      {/* ==================================================
          FINAL HEADER PREVIEW
      ================================================== */}

      {replacementProfile && (
        <section className="relabel-final-preview">
          <div className="relabel-preview-heading">
            <h3>
              Final Header Preview
            </h3>

            <span>
              {action === 'add'
                ? `${brandLabel(currentBrand)} + ${brandLabel(replacementBrand)}`
                : brandLabel(replacementBrand)}
            </span>
          </div>


          {previewStatus ===
            'building' && (
            <div className="relabel-preview-status">
              Building{' '}
              {brandLabel(
                replacementBrand
              )}{' '}
              preview...
            </div>
          )}


          {previewStatus ===
            'waiting' && (
            <div className="relabel-preview-status">
              Select the current label
              and replacement logo.
            </div>
          )}


          {previewStatus ===
            'ready' &&
            preview && (
            <div className="relabel-header-preview">
              <img
                src={
                  preview
                }
                alt="Final header preview"
              />
            </div>
          )}


          {previewStatus ===
            'error' && (
            <div className="relabel-preview-error">
              <strong>
                Preview failed.
              </strong>

              <span>
                {previewError}
              </span>
            </div>
          )}
        </section>
      )}


      {/* ==================================================
          FINAL ACTION
      ================================================== */}

      {replacementProfile && (
        <button
          type="button"
          className="tin-button relabel-go-button"
          disabled={
            processing ||
            !replacementProfile
              .logoDataUrl
          }
          onClick={
            createPdf
          }
        >
          {processing
            ? 'Working the Labeler...'
            : action === 'add'
              ? 'Add the Label'
              : 'Slap On the New Label'}
        </button>
      )}


      {/* ==================================================
          STATUS
      ================================================== */}

      {message && (
        <p className="logo-tool-message">
          {message}
        </p>
      )}
    </section>
  )
}

export default LogoTool
