FROM mariadb:10.2

# The official MariaDB image already handles MYSQL_USER, MYSQL_PASSWORD, etc.
# We only need to provide an init script to grant global privileges 
# if the tenant needs to create additional databases.

COPY ./init.sh /docker-entrypoint-initdb.d/init.sh
RUN chmod +x /docker-entrypoint-initdb.d/init.sh

CMD ["mysqld"]
EXPOSE 3306