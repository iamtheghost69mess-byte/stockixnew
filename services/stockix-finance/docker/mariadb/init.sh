#!/bin/bash
set -e

# The official MariaDB image has already created the user and database 
# using the MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE variables.

# We only need to elevate the user to have global privileges if they need to 
# create additional databases (which some migrations might require).

if [ -n "$MYSQL_USER" ]; then
    echo "Granting global privileges to $MYSQL_USER..."
    mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "GRANT ALL PRIVILEGES ON *.* TO '$MYSQL_USER'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;"
fi
