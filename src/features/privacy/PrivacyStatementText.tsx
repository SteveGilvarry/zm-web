import { Trans, useTranslation } from 'react-i18next';

interface Props {
  /** Classes for the section headings (legacy uses `<h6>`). */
  headingClassName?: string;
  linkClassName?: string;
  listClassName?: string;
}

/**
 * The body of `privacy.php`: the `Privacy*` strings from `lang/en_gb.php`
 * as markup instead of HTML-in-strings, so each sentence translates on its
 * own. Both skins render it; they only style it.
 */
export function PrivacyStatementText({ headingClassName, linkClassName, listClassName }: Props) {
  const { t } = useTranslation();
  const link = (href: string) => <a href={href} target="_blank" rel="noreferrer" className={linkClassName} />;

  return (
    <>
      <h3 className={headingClassName}>{t('About')}</h3>
      <p>
        {t('Since 2002, ZoneMinder has been the premier free and open-source Video Management System (VMS) solution for Linux platforms. ZoneMinder is supported by the community and is managed by those who choose to volunteer their spare time to the project. The best way to improve ZoneMinder is to get involved.')}
      </p>

      <h3 className={headingClassName}>{t('Contact')}</h3>
      <p>
        <Trans i18nKey="Please contact us <here>here</here> for any questions regarding our privacy policy or to have your information removed." components={{ here: link('https://zoneminder.com/contact/') }} />
      </p>
      <p>{t('For support, there are three primary ways to engage with the community:')}</p>
      <ul className={listClassName}>
        <li><Trans i18nKey="The ZoneMinder <a>user forum</a>" components={{ a: link('https://forums.zoneminder.com/') }} /></li>
        <li><Trans i18nKey="The ZoneMinder <a>Slack channel</a>" components={{ a: link('https://zoneminder-chat.herokuapp.com/') }} /></li>
        <li><Trans i18nKey="The ZoneMinder <a>Github forum</a>" components={{ a: link('https://github.com/ZoneMinder/zoneminder/issues') }} /></li>
      </ul>
      <p>{t('Our Github forum is only for bug reporting. Please use our user forum or slack channel for all other questions or comments.')}</p>

      <h3 className={headingClassName}>{t('Cookies')}</h3>
      <p>
        {t('Whether you use a web browser or a mobile app to communicate with the ZoneMinder server, a ZMSESSID cookie is created on the client to uniquely identify a session with the ZoneMinder server. ZmCSS and zmSkin cookies are created to remember your style and skin choices.')}
      </p>

      <h3 className={headingClassName}>{t('Telemetry')}</h3>
      <p>
        {t('Because ZoneMinder is open-source, anyone can install it without registering. This makes it difficult to answer questions such as: how many systems are out there, what is the largest system out there, what kind of systems are out there, or where are these systems located? Knowing the answers to these questions, helps users who ask us these questions, and it helps us set priorities based on the majority user base.')}
      </p>

      <p>{t('The ZoneMinder Telemetry daemon collects the following data about your system:')}</p>
      <ul className={listClassName}>
        <li>{t('A unique identifier (UUID)')}</li>
        <li>
          <Trans i18nKey="City based location is gathered by querying <a>ipinfo.io</a>. City, region, country, latitude, and longitude parameters are saved. The latitude and longitude coordinates are accurate down to the city or town level only!" components={{ a: link('https://ipinfo.io/geo') }} />
        </li>
        <li>{t('Current time')}</li>
        <li>{t('Total number of monitors')}</li>
        <li>{t('Total number of events')}</li>
        <li>{t('System architecture')}</li>
        <li>{t('Operating system kernel, distro, and distro version')}</li>
        <li>{t('Version of ZoneMinder')}</li>
        <li>{t('Total amount of memory')}</li>
        <li>{t('Number of cpu cores')}</li>
      </ul>

      <p>{t('The following configuration parameters from each monitor are collected:')}</p>
      <ul className={listClassName}>
        <li>{t('Id')}</li>
        <li>{t('Name')}</li>
        <li>{t('Manufacturer')}</li>
        <li>{t('Model')}</li>
        <li>{t('Type')}</li>
        <li>{t('Capturing, Analysing and Recording')}</li>
        <li>{t('Source path, with the user name, password and host removed')}</li>
        <li>{t('Width')}</li>
        <li>{t('Height')}</li>
        <li>{t('Colours')}</li>
        <li>{t('MaxFPS')}</li>
        <li>{t('AlarmMaxFPS')}</li>
        <li>{t('Whether Janus, Go2RTC, RTSP2Web and the RTSP server are enabled')}</li>
      </ul>

      <p>
        <Trans i18nKey="We are <u>NOT</u> collecting any image specific data from your cameras. We don’t know what your cameras are watching. This data will not be sold or used for any purpose not stated herein. By clicking accept, you agree to send us this data to help make ZoneMinder a better product. By clicking decline, you can still freely use ZoneMinder and all its features." components={{ u: <u /> }} />
      </p>
    </>
  );
}
