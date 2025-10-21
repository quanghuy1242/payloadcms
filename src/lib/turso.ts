type TursoConfig = {
  authToken?: string
  fallbackSQLiteFile: string
  isNextBuild: boolean
  isProduction: boolean
  tursoDatabaseURL?: string
}

type TursoConnection = {
  authToken?: string
  connectionString: string
  shouldSync: boolean
}

export const resolveTursoConnection = ({
  authToken,
  fallbackSQLiteFile,
  isNextBuild,
  isProduction,
  tursoDatabaseURL,
}: TursoConfig): TursoConnection => {
  if (!tursoDatabaseURL) {
    if (isProduction && !isNextBuild) {
      throw new Error('TURSO_DATABASE_URL must be set in production to connect to Turso.')
    }

    if (!isNextBuild) {
      console.warn(
        `TURSO_DATABASE_URL is not set. Falling back to local SQLite file at ${fallbackSQLiteFile}.`,
      )
    }

    return {
      connectionString: `file:${fallbackSQLiteFile}`,
      shouldSync: !isProduction || isNextBuild,
    }
  }

  return {
    authToken,
    connectionString: tursoDatabaseURL,
    shouldSync: !isProduction || isNextBuild,
  }
}

