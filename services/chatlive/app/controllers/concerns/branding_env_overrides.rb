# Applies Stockix / platform branding from environment variables over database defaults.
# Visual-only: does not change Chatwoot business logic.
module BrandingEnvOverrides
  BRANDING_ENV_KEYS = %w[
    INSTALLATION_NAME
    BRAND_NAME
    LOGO
    LOGO_DARK
    LOGO_THUMBNAIL
    BRAND_URL
    WIDGET_BRAND_URL
    TERMS_URL
    PRIVACY_URL
    DISPLAY_MANIFEST
  ].freeze

  module_function

  def apply!(config)
    BRANDING_ENV_KEYS.each do |key|
      config[key] = ENV[key] if ENV.key?(key)
    end
    config
  end
end
