'use strict';

/**
 * @ngdoc function
 * @name otaniemi3dApp.controller:PanoramaCtrl
 * @description
 * # PanoramaCtrl
 * Controller of the Otaniemi3D
 */
angular.module('otaniemi3dApp')
  .controller('PanoramaCtrl',
  function($scope, $stateParams, $window, $modal, sensorApi, $q, $interval) {
    var self = this;

    self.roomId = $stateParams.roomId;
    self.sensors = [];
    this.newSensors = [];
    this.class = $scope.App.fullscreen ? 'panorama-fullscreen' : '';

    var roomUrl =
      `http://otaniemi3d.cs.hut.fi/omi/node/Objects/K1/${self.roomId}`;
    var xmlPath = `panorama/${self.roomId}.xml`;

    this.room = {
      xmlPath: xmlPath,
      url: roomUrl,
      sensors: self.sensors
    };

    this.alert = {
      show: false,
      message: ''
    };

    this.addSensors = (sensors) => {
      this.newSensors = sensors;
    };

    this.goBack = () => {
      $window.history.back();
    };

    getSensorData()
      .then(displaySensors);

    function getSensorData() {
      var dataRequest = {
        'Object': {
          'id': {
            'keyValue': 'K1'
          },
          'Object': {
            'id': {
              'keyValue': self.roomId
            }
          }
        }
      };

      return sensorApi.send('read', dataRequest)
        .then((data) => {
          return data;
        });
    }

    function displaySensors(sensors) {
      return getMetaData(sensors)
        .then(waitForPanorama)
        .then(makeSensorGroups)
        .then(addSensorGroups);
    }

    function getMetaData(sensors) {
      var metaDataRequest = {
        'Object': {
          'id': {
            'keyValue': 'K1'
          },
          'Object': {
            'id': {
              'keyValue': self.roomId
            },
            'InfoItem': []
          }
        }
      };

      for (let i = 0; i < sensors.length; i++) {
        metaDataRequest.Object.Object.InfoItem.push({
          'MetaData': {},
          '@name': sensors[i].type
        });
      }

      return sensorApi.send('read', metaDataRequest)
        .then((data) => {
          self.sensors = data;
          return self.sensors;
        });
    }

    function waitForPanorama(data) {
      var deferred = $q.defer();

      $interval(() => {
        if ($('#panorama_obj').length) {
          deferred.resolve(data);
        }
      }, 150);

      return deferred.promise;
    }

    function makeSensorGroups(sensors) {
      return sensors
        .reduce((prev, curr) => {
          let key = `${curr.metaData.ath},${curr.metaData.atv}`;
          if (!prev[key]) {
            prev[key] = [];
          }
          prev[key].push(curr);
          return prev;
        }, {});
    }

    function addSensorGroups(sensorGroups) {
      var krpano = $('#panorama_obj')[0];

      angular.forEach(sensorGroups, (sensorGroup, key) => {
        var pos = key.split(',');

        krpano.call('addsensor(' + [
          sensorGroup[0].id, pos[0], pos[1],
          sensorTooltip(sensorGroup),
        ].join(',') + `,"${JSON.stringify(sensorGroup)}")`);
      });

      return sensorGroups;
    }

    function sendMetaData(sensors) {
      var writeRequest = {
        'Object': {
          'id': {
            'keyValue': 'K1'
          },
          'Object': {
            'id': {
              'keyValue': self.roomId
            },
            'InfoItem': []
          }
        }
      };

      for (let i = 0; i < sensors.length; i++) {
        writeRequest.Object.Object.InfoItem.push({
          'MetaData': {
            'InfoItem': []
          },
          '@name': sensors[i].name
        });
        angular.forEach(sensors[i].metaData, (value, key) => {
          writeRequest.Objects.Object.Object
            .InfoItem[i].MetaData.InfoItem.push({
              '@name': key,
              'value': {
                'keyValue': value,
                '@type': 'xs:double'
              }
            });
        });
      }

      return sensorApi.send('write', writeRequest);
    }

    function sensorTooltip(sensors) {
      var sensorRows = '';

      sensors.sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      });

      for (let i = 0; i < sensors.length; i++) {
        var sensorValue = sensors[i].values.length ?
          sensors[i].values[0].value : '';
        var sensorSuffix = sensors[i].suffix;
        sensorSuffix = sensorSuffix ? ` ${sensorSuffix}` : '';

        sensorRows +=
          `[tr]
             [th]
               ${sensors[i].name}
             [/th]
             [td]
               ${sensorValue}${sensorSuffix}
             [/td]
           [/tr]`;
      }

      var sensorTable =
        `[table class="tooltip-table"]
           [tr]
             [th colspan="2" style="text-align:center"]
               ${self.roomId}
             [/th]
           [/tr]
           ${sensorRows}
         [/table]`;

      return sensorTable;
    }

    //Create global namespace for scripts that can be called from
    //krpano xml.
    $window.krpano = {};

    $window.krpano.addSensorDialog = () => {

      var krpano = $('#panorama_obj')[0];
      var x = krpano.get('mouse.x');
      var y = krpano.get('mouse.y');
      var pos = krpano.screentosphere(x, y);

      this.modalInstance = $modal.open({
        templateUrl: 'templates/hotspot-selection.html',
        scope: $scope,
        controller: 'ModalCtrl',
        controllerAs: 'modal',
        resolve: {
          params() {
            return {
              room: self.room,
              alert: self.alert,
              addSensors: self.addSensors
            };
          }
        }
      });

      this.modalInstance.result.then(() => {
        if (this.newSensors.length) {
          for (let i = 0; i < this.newSensors.length; i++) {
            this.newSensors[i].metaData = {
              ath: pos.x,
              atv: pos.y
            };
          }

          for (let j = 0; j < this.newSensors.length; j++) {
            var newSensor = this.newSensors[j];
            var exists = false;

            for (let k = 0; k < self.sensors.length; k++) {
              var oldSensor = self.sensors[k];

              krpano.call(`removehotspot(${oldSensor.id})`);

              if (newSensor.id === oldSensor.id) {
                oldSensor.metaData = newSensor.metaData;
                exists = true;
                break;
              }
            }

            if (!exists) {
              self.sensors.push(newSensor);
            }
          }

          var sensorGroups = makeSensorGroups(self.sensors);
          addSensorGroups(sensorGroups);

          sendMetaData(this.newSensors);

          this.newSensors = [];
        }
      });
    };

    $scope.$on('$destroy', () => {
      if (this.modalInstance) {
        this.modalInstance.dismiss();
      }
    });

  });
